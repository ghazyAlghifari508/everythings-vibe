import { z } from "zod";
import { isProvisionalCodebaseName } from "./codebase-naming";
import {
	canOpenSummary,
	codebaseAnalysisStatusSchema,
	type SyncStatusResponse,
} from "./codebase-sync";
import {
	CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS,
	CODEBASE_ANALYSIS_MAX_MANIFEST_ENTRIES,
	CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS,
	CODEBASE_STARTER_DESCRIPTION_MAX_CHARS,
	CODEBASE_STARTER_PROMPT_MAX_CHARS,
	CODEBASE_STARTER_TITLE_MAX_CHARS,
} from "./constants";
import { extractJson } from "./services/json-extract";

// === Codebase analysis (validated advisory output) ===
// The analysis is advisory: uncertain detections must stay labeled as
// uncertainty/verification items and must never be presented as fact.

export const codebaseAnalysisFindingSchema = z.object({
	title: z.string().min(1),
	detail: z.string().min(1),
	uncertainty: z.string().min(1).optional(),
	relevantPaths: z.array(z.string().min(1)).optional(),
});

export type CodebaseAnalysisFinding = z.infer<
	typeof codebaseAnalysisFindingSchema
>;

export const CODEBASE_STARTER_IDS = [
	"feature",
	"bugfix",
	"refactor",
	"ui",
] as const;

export const codebaseStarterSuggestionSchema = z.object({
	id: z.enum(CODEBASE_STARTER_IDS),
	title: z.string().min(1).max(CODEBASE_STARTER_TITLE_MAX_CHARS),
	description: z.string().min(1).max(CODEBASE_STARTER_DESCRIPTION_MAX_CHARS),
	prompt: z.string().min(1).max(CODEBASE_STARTER_PROMPT_MAX_CHARS),
	relevantPaths: z.array(z.string().min(1)).optional(),
});

export type CodebaseStarterSuggestion = z.infer<
	typeof codebaseStarterSuggestionSchema
>;

export const codebaseStarterSuggestionsSchema = z
	.array(codebaseStarterSuggestionSchema)
	.length(CODEBASE_STARTER_IDS.length)
	.refine((suggestions) =>
		CODEBASE_STARTER_IDS.every(
			(id) =>
				suggestions.filter((suggestion) => suggestion.id === id).length === 1,
		),
	);

const codebaseAnalysisBaseSchema = z.object({
	projectId: z.string().min(1),
	snapshotId: z.string().min(1),
	// Model-generated application summary: what the app is and does, in two
	// to three Indonesian sentences. Optional so legacy rows stored before
	// this field existed keep parsing; the review UI renders an honest
	// fallback when it is absent instead of fabricating one.
	summary: z
		.string()
		.min(1)
		.max(CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS)
		.optional(),
	framework: z.string().min(1).optional(),
	language: z.string().min(1).optional(),
	packageManager: z.string().min(1).optional(),
	dependencies: z.array(z.string().min(1)).optional(),
	database: z.string().min(1).nullable().optional(),
	auth: z.string().min(1).nullable().optional(),
	moduleMap: z
		.array(
			z.object({
				path: z.string().min(1),
				summary: z.string().min(1),
			}),
		)
		.optional(),
	relevantFiles: z.array(z.string().min(1)).optional(),
	impactAreas: z.array(z.string().min(1)).optional(),
	limitations: z.array(z.string().min(1)).optional(),
	findings: z.array(codebaseAnalysisFindingSchema).optional(),
});

export const codebaseAnalysisSchema = codebaseAnalysisBaseSchema.extend({
	starterSuggestions: codebaseStarterSuggestionsSchema.optional(),
});

export const codebaseAnalysisGenerationSchema =
	codebaseAnalysisBaseSchema.extend({
		starterSuggestions: codebaseStarterSuggestionsSchema,
	});

export type CodebaseAnalysis = z.infer<typeof codebaseAnalysisSchema>;

export function resolveAnalysisFeaturePrompt(input: {
	handoffPrompt: string | null | undefined;
	projectName: string;
	projectId: string;
}): string {
	const prompt = input.handoffPrompt?.trim();
	if (prompt && !isProvisionalCodebaseName(prompt)) return prompt;
	const name = input.projectName.trim();
	if (name && !isProvisionalCodebaseName(name)) return name;
	return input.projectId;
}

/**
 * Neutral onboarding intent for the initial codebase analysis. Used whenever
 * no explicit feature request exists yet — in particular, a provisional
 * repository placeholder must never stand in for it. The analysis then
 * describes the repository instead of speculating about a feature name.
 */
export const ONBOARDING_FEATURE_MESSAGE = "Ringkasan codebase awal";

export interface AnalysisScopeInput {
	projectId: string;
	projectMode: string | null | undefined;
	projectCodebaseId: string | null | undefined;
	projectUserId: string;
	authenticatedUserId: string;
	codebaseOwnerId?: string | null;
}

export type AnalysisScope =
	| { kind: "project"; projectId: string }
	| { kind: "codebase"; projectId: string; codebaseId: string };

export function resolveAnalysisScope(
	input: AnalysisScopeInput,
): AnalysisScope | { kind: "not_found" } {
	if (input.projectUserId !== input.authenticatedUserId) {
		return { kind: "not_found" };
	}
	if (input.projectMode !== "existing_codebase") {
		return { kind: "not_found" };
	}
	if (!input.projectCodebaseId) {
		return { kind: "project", projectId: input.projectId };
	}
	if (input.codebaseOwnerId !== input.authenticatedUserId) {
		return { kind: "not_found" };
	}
	return {
		kind: "codebase",
		projectId: input.projectId,
		codebaseId: input.projectCodebaseId,
	};
}

export function parseCodebaseAnalysis(input: unknown): CodebaseAnalysis {
	return codebaseAnalysisSchema.parse(input);
}

export function safeParseCodebaseAnalysis(input: unknown) {
	return codebaseAnalysisSchema.safeParse(input);
}

// === Analysis orchestration boundary (Task 6) ===
// Pure, isomorphic helpers for the server-side analysis flow. Database access
// and model invocation live in `codebase-analysis.server.ts`; everything here
// stays unit-testable without a database or network.

export const CODEBASE_ANALYSIS_SYSTEM_PROMPT = `Kamu adalah PrdFy AI. Analisis snapshot codebase yang disinkronkan dan susun ringkasan arsitektur advisori.

FORMAT JSON (output HANYA JSON, tanpa teks lain):
{
  "summary": "Ringkasan 2-3 kalimat tentang aplikasi ini: apa fungsinya, alur utama, dan bagaimana data dikelola. Kosongkan bila bukti snapshot tidak cukup — jangan mengarang",
  "framework": "Framework yang terdeteksi, atau null bila tidak terdeteksi",
  "language": "Bahasa utama, atau null bila tidak terdeteksi",
  "packageManager": "Package manager, atau null bila tidak terdeteksi",
  "dependencies": ["dependensi utama"],
  "database": "Database yang terdeteksi, atau null",
  "auth": "Mekanisme auth yang terdeteksi, atau null",
  "moduleMap": [{ "path": "jalur-modul", "summary": "ringkasan singkat" }],
  "relevantFiles": ["jalur file yang relevan"],
  "impactAreas": ["area yang terdampak fitur baru"],
  "limitations": ["keterbatasan snapshot/analisis"],
  "findings": [{ "title": "...", "detail": "...", "uncertainty": "hal yang belum pasti (wajib diisi bila ragu)" }],
  "starterSuggestions": [
    { "id": "feature", "title": "judul tugas konkret dalam Bahasa Indonesia", "description": "ringkasan singkat dalam Bahasa Indonesia", "prompt": "instruksi lengkap dalam Bahasa Indonesia dan siap diedit" },
    { "id": "bugfix", "title": "judul tugas konkret dalam Bahasa Indonesia", "description": "ringkasan singkat dalam Bahasa Indonesia", "prompt": "instruksi lengkap dalam Bahasa Indonesia dan siap diedit" },
    { "id": "refactor", "title": "judul tugas konkret dalam Bahasa Indonesia", "description": "ringkasan singkat dalam Bahasa Indonesia", "prompt": "instruksi lengkap dalam Bahasa Indonesia dan siap diedit" },
    { "id": "ui", "title": "judul tugas konkret dalam Bahasa Indonesia", "description": "ringkasan singkat dalam Bahasa Indonesia", "prompt": "instruksi lengkap dalam Bahasa Indonesia dan siap diedit" }
  ]
}

ATURAN:
1. Output HANYA JSON valid. Jangan tambah penjelasan di luar JSON.
2. JANGAN mengarang jalur file, perilaku framework, atau detail arsitektur yang tidak ada di snapshot. Gunakan HANYA jalur dari manifest.
3. Setiap temuan yang tidak pasti WAJIB mencantumkan field "uncertainty" berisi hal yang perlu diverifikasi.
4. Field yang tidak terdeteksi diisi null atau array kosong — jangan ditebak.
5. Tulis ringkasan dan temuan dalam Bahasa Indonesia.
6. Summary menjawab "aplikasi ini tentang apa" (fungsi, alur utama, pengelolaan data) — bukan sekadar menyebut ulang tech stack.
7. starterSuggestions wajib berisi tepat satu saran untuk setiap id: feature, bugfix, refactor, dan ui. Setiap saran harus spesifik, kecil, berguna, dan diturunkan dari summary, moduleMap, relevantFiles, impactAreas, findings, atau isi source snapshot.
8. Jangan menyimpulkan domain aplikasi dari framework, bahasa, dependency, atau nama repository. Identifikasi fitur yang sudah terbukti ada agar saran tidak menggandakan kemampuan yang sudah tersedia.
9. Untuk kategori feature, usulkan kemampuan yang masuk akal dari bukti tentang fungsi aplikasi. Untuk bugfix, sebutkan kondisi yang benar-benar tampak bermasalah; bila belum ada bukti bug, pilih perbaikan alur konservatif dan jangan menyatakan bug pasti ada. Untuk refactor, pilih modul atau pola yang terlihat dan pertahankan stack/perilaku. Jangan usulkan migrasi stack kecuali findings secara eksplisit membuktikan kebutuhan. Untuk ui, rujuk antarmuka yang benar-benar terlihat dalam source snapshot.
10. Title, description, dan prompt harus ditulis dalam Bahasa Indonesia. Pertahankan istilah teknis baku dalam Bahasa Inggris. Prompt harus berupa instruksi lengkap dan siap diedit/dikirim, bukan fragmen atau template kosong. Title dan description singkat dan spesifik. Jangan membuat klaim behavior yang tidak dibuktikan snapshot.
11. relevantPaths hanya boleh berisi jalur yang benar-benar ada dalam manifest. Sertakan jalur saat saran menyebut modul tertentu; bila tidak dapat membuktikan jalurnya, jangan mengarangnya.
12. Nama repository adalah metadata identitas, bukan permintaan fitur: jangan menafsirkan atau mempermasalahkan nama tersebut sebagai permintaan user, dan jangan membuat temuan tentang ambiguitasnya. Simpulkan aplikasi HANYA dari manifest dan konteks sumber.`;

// Manifest entries come from `manifestEntrySchema` (Task 5); this structural
// subset keeps the prompt builder decoupled from the sync DTO module.
export interface AnalysisManifestEntry {
	path: string;
	size: number;
	language?: string;
}

export interface AnalysisSourceFile {
	path: string;
	text: string;
}

export interface AnalysisPromptInput {
	projectId: string;
	snapshotId: string;
	featurePrompt: string;
	manifest: readonly AnalysisManifestEntry[];
	files: readonly AnalysisSourceFile[];
	fileCount: number;
	excludedCount: number;
	branch?: string | null;
	commitSha?: string | null;
	/**
	 * Resolved repository display name (identity metadata, never user
	 * intent). Omitted when unknown — no name is ever invented here.
	 */
	repositoryName?: string | null;
	maxContextChars?: number;
	maxManifestEntries?: number;
}

export interface SourceExcerptSelection {
	excerpts: AnalysisSourceFile[];
	truncated: boolean;
}

// Deterministic excerpt selection: files keep manifest order and the total
// text is capped so the model prompt stays bounded. Callers must pass the
// bound from CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS (constants), never inline.
export function selectSourceExcerpts(
	files: readonly AnalysisSourceFile[],
	maxChars: number,
): SourceExcerptSelection {
	const excerpts: AnalysisSourceFile[] = [];
	let used = 0;
	let truncated = false;
	for (const file of files) {
		if (used >= maxChars) {
			truncated = true;
			break;
		}
		const remaining = maxChars - used;
		if (file.text.length <= remaining) {
			excerpts.push(file);
			used += file.text.length;
		} else {
			excerpts.push({ path: file.path, text: file.text.slice(0, remaining) });
			used = maxChars;
			truncated = true;
		}
	}
	return { excerpts, truncated };
}

export function buildAnalysisUserPrompt(input: AnalysisPromptInput): string {
	const {
		projectId,
		snapshotId,
		featurePrompt,
		manifest,
		files,
		fileCount,
		excludedCount,
		branch,
		commitSha,
		repositoryName,
		maxContextChars = CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS,
		maxManifestEntries = CODEBASE_ANALYSIS_MAX_MANIFEST_ENTRIES,
	} = input;
	const listedManifest = manifest.slice(0, maxManifestEntries);
	const manifestLines = listedManifest.map(
		(entry) =>
			`- ${entry.path} (${entry.size} bytes${entry.language ? `, ${entry.language}` : ""})`,
	);
	if (manifest.length > listedManifest.length) {
		manifestLines.push(
			`(+ ${manifest.length - listedManifest.length} entri lainnya tidak ditampilkan — jangan mengarang jalur di luar daftar ini.)`,
		);
	}
	const { excerpts, truncated } = selectSourceExcerpts(files, maxContextChars);
	const excerptLines = excerpts.map(
		(file) => `=== ${file.path} ===\n${file.text}`,
	);
	const lines = [
		`Project: ${projectId}`,
		`Snapshot: ${snapshotId}${branch ? ` (branch ${branch}${commitSha ? `, commit ${commitSha}` : ""})` : ""}`,
		`File: ${fileCount} terupload, ${excludedCount} dieksklusi (isi file yang dieksklusi TIDAK disertakan).`,
		...(repositoryName
			? [
					`Repository: ${repositoryName} (metadata identitas repositori — bukan permintaan fitur user).`,
				]
			: []),
		"",
		`Permintaan fitur user: ${featurePrompt}`,
		"",
		"Manifest (jalur tepercaya — jangan mengarang jalur di luar daftar ini):",
		...manifestLines,
		"",
		"Konteks sumber (terpotong agar terbatas):",
		...excerptLines,
	];
	if (truncated) {
		lines.push(
			"",
			"(Konteks sumber dipotong karena batas ukuran — tandai cakupan yang hilang di limitations.)",
		);
	}
	return lines.join("\n");
}

// === Model output validation ===
// Server identities are injected AFTER parsing: model-provided projectId /
// snapshotId are discarded so a rogue completion cannot rebind the analysis
// to another project or snapshot.

export type AnalysisValidationReason =
	| "invalid_json"
	| "schema"
	| "untrusted_paths";

export const ANALYSIS_VALIDATION_MESSAGE =
	"AI menghasilkan output yang tidak valid. Coba analisis ulang.";

const MAX_DIAGNOSTIC_ISSUE_PATHS = 8;
const MAX_DIAGNOSTIC_PATH_CHARS = 120;

function toDiagnosticPath(value: unknown): string {
	const text = Array.isArray(value)
		? value.map((segment) => String(segment)).join(".")
		: String(value);
	return text.length > MAX_DIAGNOSTIC_PATH_CHARS
		? text.slice(0, MAX_DIAGNOSTIC_PATH_CHARS)
		: text;
}

export class AnalysisValidationError extends Error {
	readonly code = "ANALYSIS_FAILED" as const;
	readonly reason: AnalysisValidationReason;
	readonly issuePaths: readonly string[];
	readonly rawLength: number;

	constructor(input: {
		reason: AnalysisValidationReason;
		rawLength: number;
		issuePaths?: readonly string[];
	}) {
		super(ANALYSIS_VALIDATION_MESSAGE);
		this.name = "AnalysisValidationError";
		this.reason = input.reason;
		this.rawLength = input.rawLength;
		this.issuePaths = input.issuePaths ?? [];
	}
}

export function parseAnalysisOutput(
	raw: string,
	ids: { projectId: string; snapshotId: string },
	trustedManifestPaths: ReadonlySet<string>,
): CodebaseAnalysis {
	let parsed: unknown;
	try {
		// Strict-JSON boundary: anything that is not JSON (including a
		// mis-rendered HTML page) fails closed into AnalysisValidationError.
		parsed = JSON.parse(extractJson(raw)) as unknown;
	} catch {
		throw new AnalysisValidationError({
			reason: "invalid_json",
			rawLength: raw.length,
		});
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new AnalysisValidationError({
			reason: "invalid_json",
			rawLength: raw.length,
		});
	}
	const {
		projectId: _droppedProject,
		snapshotId: _droppedSnapshot,
		...rest
	} = parsed as Record<string, unknown>;
	const result = codebaseAnalysisGenerationSchema.safeParse({
		...rest,
		projectId: ids.projectId,
		snapshotId: ids.snapshotId,
	});
	if (!result.success) {
		throw new AnalysisValidationError({
			reason: "schema",
			rawLength: raw.length,
			issuePaths: result.error.issues
				.slice(0, MAX_DIAGNOSTIC_ISSUE_PATHS)
				.map((issue) =>
					toDiagnosticPath(issue.path.length > 0 ? issue.path : "(root)"),
				),
		});
	}
	const untrusted = result.data.starterSuggestions.flatMap((suggestion) =>
		(suggestion.relevantPaths ?? []).filter(
			(path) => !trustedManifestPaths.has(path),
		),
	);
	if (untrusted.length > 0) {
		throw new AnalysisValidationError({
			reason: "untrusted_paths",
			rawLength: raw.length,
			issuePaths: untrusted
				.slice(0, MAX_DIAGNOSTIC_ISSUE_PATHS)
				.map((path) => toDiagnosticPath(path)),
		});
	}
	return result.data;
}

// Fixed user-facing message. Never echoes model text, stack traces, tokens,
// or source content — the caller stores only this string.
export function toSafeAnalysisErrorMessage(error: unknown): string {
	void error;
	return "Analisis codebase gagal. Coba analisis ulang dalam beberapa menit.";
}

// === Server-side failure diagnostics ===
// Operators need to know WHY an attempt failed (provider, timeout, malformed
// JSON, schema mismatch, invented paths, persistence), while users must only
// ever see the fixed safe message above. These helpers classify the failure
// and shape a log record that carries an attempt identifier, the category,
// the actual duration, and validation issue paths — never API keys, sync
// tokens, repository content, or unrestricted model output.
export const ANALYSIS_FAILURE_CATEGORIES = [
	"provider",
	"timeout",
	"aborted",
	"snapshot",
	"invalid_json",
	"schema",
	"untrusted_paths",
	"persistence",
	"unknown",
] as const;

export type AnalysisFailureCategory =
	(typeof ANALYSIS_FAILURE_CATEGORIES)[number];

export type AnalysisAttemptStage = "generate" | "persist";

function readServiceErrorCode(error: unknown): string | null {
	if (!(error instanceof Error)) return null;
	if (error.name !== "AnalysisServiceError") return null;
	if (!("code" in error)) return null;
	const code: unknown = error.code;
	return typeof code === "string" ? code : null;
}

export function classifyAnalysisFailure(
	error: unknown,
	stage?: AnalysisAttemptStage,
): AnalysisFailureCategory {
	if (error instanceof AnalysisValidationError) return error.reason;
	if (readServiceErrorCode(error) === "SNAPSHOT_NOT_UPLOADED") {
		return "snapshot";
	}
	const message = error instanceof Error ? error.message : String(error);
	if (/aborted|aborterror/i.test(message)) return "aborted";
	if (
		/tidak merespons dalam 2 menit|melebihi batas waktu|timeout|timed out|etimedout|stall/i.test(
			message,
		)
	) {
		return "timeout";
	}
	if (
		/tidak tersedia|rate.?limit|too many requests|429|401|403|unauthorized|unauthenticated|api key|model|provider|respons kosong|fetch failed|econn|network|socket/i.test(
			message,
		)
	) {
		return "provider";
	}
	if (stage === "persist") return "persistence";
	return "unknown";
}

export interface AnalysisDiagnosticRecord {
	attemptId: string;
	projectId: string;
	snapshotId: string;
	category: AnalysisFailureCategory;
	durationMs: number;
	issuePaths?: readonly string[];
	rawLength?: number;
}

export function formatAnalysisDiagnosticLog(
	record: AnalysisDiagnosticRecord,
): Record<string, string | number | readonly string[]> {
	const shaped: Record<string, string | number | readonly string[]> = {
		attemptId: record.attemptId,
		projectId: record.projectId,
		snapshotId: record.snapshotId,
		category: record.category,
		durationMs: record.durationMs,
	};
	if (record.issuePaths && record.issuePaths.length > 0) {
		shaped.issuePaths = record.issuePaths;
	}
	if (typeof record.rawLength === "number") {
		shaped.rawLength = record.rawLength;
	}
	return shaped;
}

// === Idempotent trigger decision (pure, DB-agnostic) ===
// The route loads the snapshot row + its analysis rows, then applies this
// decision: analysis runs ONLY on uploaded snapshots; a pending or ready
// record is reused; each new attempt after failure gets a fresh record.

export type AnalysisRequestDecision =
	| { action: "create" }
	| { action: "reuse"; analysisId: string }
	| { action: "reject"; code: "SNAPSHOT_NOT_UPLOADED"; message: string };

export function decideAnalysisRequest(
	snapshot: { id: string; status: string },
	analyses: readonly { id: string; status: string }[],
): AnalysisRequestDecision {
	if (snapshot.status !== "uploaded") {
		return {
			action: "reject",
			code: "SNAPSHOT_NOT_UPLOADED",
			message:
				"Snapshot belum siap dianalisis. Selesaikan sync terlebih dahulu.",
		};
	}
	const pending = analyses.find((analysis) => analysis.status === "pending");
	if (pending) return { action: "reuse", analysisId: pending.id };
	const ready = analyses.find((analysis) => analysis.status === "ready");
	if (ready) return { action: "reuse", analysisId: ready.id };
	return { action: "create" };
}

// === Trigger/read DTOs ===

export const analysisRequestSchema = z.object({
	snapshotId: z.string().min(1).optional(),
});

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export const analysisResponseSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	snapshotId: z.string().min(1),
	status: codebaseAnalysisStatusSchema,
	output: codebaseAnalysisSchema.nullable().optional(),
	errorCode: z.string().min(1).nullable().optional(),
	errorMessage: z.string().min(1).nullable().optional(),
	createdAt: z.string().datetime().optional(),
	updatedAt: z.string().datetime().optional(),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export interface CanContinueToCodebaseConclusionInput {
	status: SyncStatusResponse | null | undefined;
	analysis: AnalysisResponse | null | undefined;
	codebaseId: string;
	analysisProjectId: string | null | undefined;
}

/**
 * Authoritative pure predicate determining whether codebase onboarding
 * can advance from sync to conclusion.
 */
export function canContinueToCodebaseConclusion(
	input: CanContinueToCodebaseConclusionInput,
): boolean {
	if (!input.status || !input.analysis) {
		return false;
	}

	if (!canOpenSummary(input.status)) {
		return false;
	}

	if (
		input.status.analysisStatus !== "ready" ||
		input.analysis.status !== "ready"
	) {
		return false;
	}

	if (
		!input.status.analysisId ||
		!input.analysis.id ||
		input.status.analysisId !== input.analysis.id
	) {
		return false;
	}

	if (!input.codebaseId || input.status.projectId !== input.codebaseId) {
		return false;
	}

	if (
		!input.analysisProjectId ||
		input.analysis.projectId !== input.analysisProjectId
	) {
		return false;
	}

	if (
		!input.status.snapshotId ||
		input.analysis.snapshotId !== input.status.snapshotId
	) {
		return false;
	}

	if (!input.analysis.output) {
		return false;
	}

	const parsedAnalysis = codebaseAnalysisSchema.safeParse(
		input.analysis.output,
	);
	if (!parsedAnalysis.success) {
		return false;
	}

	const output = parsedAnalysis.data;
	if (
		output.projectId !== input.analysisProjectId ||
		output.snapshotId !== input.status.snapshotId
	) {
		return false;
	}

	if (!output.starterSuggestions) {
		return false;
	}

	const parsedSuggestions = codebaseStarterSuggestionsSchema.safeParse(
		output.starterSuggestions,
	);
	if (!parsedSuggestions.success) {
		return false;
	}

	return true;
}

// === Tech stack inference from codebase analysis (for /ask auto-select) ===

export interface InferredTechAnswers {
	frontend?: string;
	backend?: string;
	fullstackFramework?: string;
	database?: string;
	deployment?: string;
}

export function inferTechAnswersFromCodebase(
	analysis: CodebaseAnalysis,
	platform: "web" | "mobile" = "web",
): InferredTechAnswers {
	const out: InferredTechAnswers = {};
	const framework = (analysis.framework ?? "").toLowerCase();
	const deps = (analysis.dependencies ?? []).map((d) => d.toLowerCase());
	const dbStr = (analysis.database ?? "").toLowerCase();
	const modulePaths = (analysis.moduleMap ?? []).map((m) =>
		m.path.toLowerCase(),
	);
	const relevantPaths = (analysis.relevantFiles ?? []).map((p) =>
		p.toLowerCase(),
	);
	const allPaths = [...modulePaths, ...relevantPaths];

	const hasDep = (...names: string[]) =>
		deps.some((d) => names.some((n) => d.includes(n)));
	const hasPath = (...fragments: string[]) =>
		allPaths.some((p) => fragments.some((f) => p.includes(f)));

	if (platform === "mobile") {
		if (framework.includes("flutter") || hasDep("flutter")) {
			out.frontend = "Flutter";
		} else if (framework.includes("expo") || hasDep("expo")) {
			out.frontend = "Expo";
		} else if (framework.includes("react native") || hasDep("react-native")) {
			out.frontend = "React Native";
		} else if (framework.includes("ionic") || hasDep("@ionic")) {
			out.frontend = "Ionic";
		} else if (framework.includes("capacitor") || hasDep("@capacitor")) {
			out.frontend = "Capacitor";
		}
	} else {
		// Fullstack checks first
		if (
			framework.includes("tanstack start") ||
			hasDep("@tanstack/react-start", "@tanstack/start")
		) {
			out.fullstackFramework = "TanStack Start (FE+BE)";
		} else if (
			framework.includes("next") ||
			hasDep("next") ||
			hasPath("pages/api", "app/api")
		) {
			out.fullstackFramework = "Next.js (FE+BE)";
		} else if (framework.includes("nuxt") || hasDep("nuxt")) {
			out.fullstackFramework = "Nuxt.js (FE+BE)";
		} else if (framework.includes("sveltekit") || hasDep("@sveltejs/kit")) {
			out.fullstackFramework = "SvelteKit (FE+BE)";
		} else if (framework.includes("remix") || hasDep("@remix-run")) {
			out.fullstackFramework = "Remix (FE+BE)";
		} else if (framework.includes("astro") || hasDep("astro")) {
			out.fullstackFramework = "Astro (FE+BE)";
		} else {
			// Standalone Frontend checks
			if (framework.includes("react") || hasDep("react")) {
				out.frontend = "React (Vite)";
			} else if (framework.includes("vue") || hasDep("vue")) {
				out.frontend = "Vue.js";
			} else if (framework.includes("svelte") || hasDep("svelte")) {
				out.frontend = "Svelte";
			} else if (framework.includes("angular") || hasDep("@angular")) {
				out.frontend = "Angular";
			} else if (framework.includes("solid") || hasDep("solid-js")) {
				out.frontend = "Solid";
			}
		}
	}

	// Backend checks (if not already fullstack)
	if (!out.fullstackFramework) {
		if (hasDep("hono")) {
			out.backend = "Hono";
		} else if (hasDep("express")) {
			out.backend = "Express.js";
		} else if (hasDep("fastify")) {
			out.backend = "Fastify";
		} else if (hasDep("@nestjs/core", "nestjs")) {
			out.backend = "NestJS";
		} else if (hasDep("@supabase/supabase-js", "supabase")) {
			out.backend = "Supabase (BaaS)";
		} else if (hasDep("firebase", "firebase-admin")) {
			out.backend = "Firebase (BaaS)";
		} else if (hasDep("convex")) {
			out.backend = "Convex (BaaS)";
		} else if (hasDep("insforge", "@insforge")) {
			out.backend = "Insforge (BaaS)";
		} else if (analysis.language?.toLowerCase().includes("go")) {
			out.backend = "Go";
		} else if (analysis.language?.toLowerCase().includes("python")) {
			out.backend = "Python (FastAPI)";
		}
	}

	// Database checks
	if (
		dbStr.includes("postgres") ||
		dbStr.includes("pg") ||
		hasDep("pg", "postgres", "@vercel/postgres") ||
		(hasDep("drizzle-orm") &&
			!dbStr.includes("sqlite") &&
			!dbStr.includes("mysql"))
	) {
		out.database = "PostgreSQL";
	} else if (dbStr.includes("mysql") || hasDep("mysql", "mysql2")) {
		out.database = "MySQL";
	} else if (dbStr.includes("sqlite") || hasDep("better-sqlite3", "sqlite3")) {
		out.database = "SQLite";
	} else if (dbStr.includes("mongo") || hasDep("mongodb", "mongoose")) {
		out.database = "MongoDB";
	} else if (dbStr.includes("redis") || hasDep("ioredis", "redis")) {
		out.database = "Redis";
	} else if (dbStr.includes("supabase") || hasDep("@supabase/supabase-js")) {
		out.database = "Supabase Postgres";
	} else if (dbStr.includes("neon") || hasDep("@neondatabase/serverless")) {
		out.database = "Neon";
	} else if (dbStr.includes("turso") || hasDep("@libsql/client")) {
		out.database = "Turso";
	}

	// Deployment checks
	if (hasPath("vercel.json") || hasDep("@vercel/node")) {
		out.deployment = "Vercel";
	} else if (hasPath("netlify.toml") || hasDep("@netlify/functions")) {
		out.deployment = "Netlify";
	} else if (hasPath("fly.toml")) {
		out.deployment = "Fly.io";
	} else if (hasPath("railway.json")) {
		out.deployment = "Railway";
	} else if (hasPath("dockerfile", "docker-compose")) {
		out.deployment = "Docker / VPS";
	} else if (
		out.frontend === "React (Vite)" ||
		out.fullstackFramework?.includes("Next.js") ||
		out.fullstackFramework?.includes("TanStack Start")
	) {
		out.deployment = "Vercel";
	}

	return out;
}
