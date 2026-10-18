import {
	CODEBASE_ANALYSIS_MAX_CONTEXT_CHARS,
	CODEBASE_ANALYSIS_MAX_MANIFEST_ENTRIES,
	CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS,
	CODEBASE_STARTER_DESCRIPTION_MAX_CHARS,
	CODEBASE_STARTER_PROMPT_MAX_CHARS,
	CODEBASE_STARTER_TITLE_MAX_CHARS,
} from "@/features/codebase/types/codebase-constants";
import type {
	AnalysisValidationReason,
	CodebaseStarterSuggestion,
} from "./analysis-schema";
import { isProvisionalCodebaseName } from "./naming";

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

export const CODEBASE_ANALYSIS_SYSTEM_PROMPT = `Kamu adalah PrdFy AI. Analisis snapshot codebase yang disinkronkan dan susun ringkasan arsitektur advisori.

FORMAT JSON (output HANYA JSON, tanpa teks lain):
{
  "summary": "Ringkasan 2-3 kalimat tentang aplikasi ini: apa fungsinya, alur utama, dan bagaimana data dikelola. Hilangkan field ini bila bukti snapshot tidak cukup — jangan mengarang",
  "framework": "Framework yang terdeteksi (hilangkan field bila tidak terdeteksi)",
  "language": "Bahasa utama (hilangkan field bila tidak terdeteksi)",
  "packageManager": "Package manager (hilangkan field bila tidak terdeteksi)",
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
4. Field database/auth yang tidak terdeteksi diisi null; field opsional lain yang tidak terdeteksi dihilangkan atau diisi array kosong — jangan tulis null dan jangan ditebak.
5. Tulis ringkasan dan temuan dalam Bahasa Indonesia.
6. Summary menjawab "aplikasi ini tentang apa" (fungsi, alur utama, pengelolaan data) — bukan sekadar menyebut ulang tech stack.
7. starterSuggestions wajib berisi tepat satu saran untuk setiap id: feature, bugfix, refactor, dan ui. Setiap saran harus spesifik, kecil, berguna, dan diturunkan dari summary, moduleMap, relevantFiles, impactAreas, findings, atau isi source snapshot.
8. Saran ditulis sebagai permintaan perbaikan produk, bukan instruksi kerja untuk coding agent. Title, description, dan prompt harus menyatakan tujuan, perilaku yang diharapkan, dan manfaat bagi pengguna. Saran harus tetap bisa dibaca dan bernilai bagi pemilik produk yang tidak mengenal isi repository.
9. DILARANG menulis di title, description, dan prompt: nama file, jalur file, nama folder source, nama fungsi/komponen/property, hook, tipe data, nama variabel, nama class, dan penjelasan algoritma atau struktur data. Jangan memberi instruksi membuka atau mengubah berkas tertentu. Bukti teknis tentang lokasi dan modul disimpan di field relevantPaths, bukan di teks yang dibaca pengguna. Detail implementasi diputuskan oleh tahap perencanaan yang berjalan setelah ini, dengan membaca repository secara langsung.
10. Jangan menyimpulkan domain aplikasi dari framework, bahasa, dependency, atau nama repository. Identifikasi fitur yang sudah terbukti ada agar saran tidak menggandakan kemampuan yang sudah tersedia.
11. Untuk kategori feature, usulkan kemampuan yang masuk akal dari bukti tentang fungsi aplikasi. Untuk bugfix, sebutkan kondisi yang benar-benar tampak bermasalah; bila belum ada bukti bug, pilih perbaikan alur konservatif dan jangan menyatakan bug pasti ada. Untuk refactor, pilih modul atau pola yang terlihat dan pertahankan stack/perilaku. Jangan usulkan migrasi stack kecuali findings secara eksplisit membuktikan kebutuhan. Untuk ui, rujuk antarmuka yang benar-benar terlihat dalam source snapshot.
12. Title, description, dan prompt harus ditulis dalam Bahasa Indonesia. Gunakan istilah baku hanya bila istilah itu benar-benar dikenal pengguna (mis. Kanban, checkout, onboarding); istilah internal repository tidak boleh muncul di title, description, dan prompt. Prompt harus berupa permintaan lengkap dan siap diedit/dikirim, bukan fragmen atau template kosong. Title dan description singkat dan spesifik: title maksimal 80 karakter, description maksimal 180 karakter, prompt maksimal 1500 karakter. Jangan membuat klaim behavior yang tidak dibuktikan snapshot.
13. relevantPaths hanya boleh berisi jalur yang benar-benar ada dalam manifest. Sertakan jalur saat saran menyentuh modul tertentu, karena jalur ini dipakai tahap perencanaan sebagai konteks teknis; bila tidak dapat membuktikan jalurnya, jangan mengarangnya.
14. Nama repository adalah metadata identitas, bukan permintaan fitur: jangan menafsirkan atau mempermasalahkan nama tersebut sebagai permintaan user, dan jangan membuat temuan tentang ambiguitasnya. Simpulkan aplikasi HANYA dari manifest dan konteks sumber.`;

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

// === User-facing starter copy guard ===
// A starter card is read by someone deciding WHAT to improve, not by an agent
// deciding HOW to patch files. The technical evidence stays in `relevantPaths`
// and the rest of the analysis, so the fields the user reads must stay in
// product language. The rules below match token SHAPES (a source-file path, a
// framework hook identifier), never a fixed list of words, so they hold for any
// repository domain and any wording.
//
// This guard runs only on freshly generated output. Persisted analyses from
// earlier runs are parsed with the plain schema, so tightening the contract
// never invalidates history the user already sees.
const SOURCE_FILE_TOKEN =
	/\.(?:tsx?|jsx?|mts|cts|mjs|cjs|vue|svelte|astro|py|rb|go|rs|java|kt|kts|swift|php|cs|css|scss|sass|less|styl|sql|prisma|graphql|gql|ex|exs|erl|clj)$/i;
const REACT_HOOK_TOKEN = /\buse[A-Z][A-Za-z0-9]*\b/;
const TOKEN_SPLIT = /[\s"'`(),;:[\]{}<>|]+/;

/**
 * Report the user-facing starter fields that leak repository implementation
 * detail. Locations only (`starterSuggestions.<id>.<field>`) — never the
 * offending token — so callers can log and repair without echoing model text.
 */
export function findStarterTechnicalLeaks(
	suggestions: readonly CodebaseStarterSuggestion[],
): string[] {
	const leaks: string[] = [];
	for (const suggestion of suggestions) {
		const fields: Array<[string, string]> = [
			["title", suggestion.title],
			["description", suggestion.description],
			["prompt", suggestion.prompt],
		];
		for (const [field, value] of fields) {
			const tokens = value.split(TOKEN_SPLIT).filter(Boolean);
			const leaked = tokens.some(
				(token) =>
					SOURCE_FILE_TOKEN.test(token) || REACT_HOOK_TOKEN.test(token),
			);
			if (leaked) leaks.push(`starterSuggestions.${suggestion.id}.${field}`);
		}
	}
	return leaks;
}

// === Bounded single repair ===
// A validation failure is a fixable output-contract miss, not proof the
// repository is unanalyzable. The caller gets exactly one correction
// request carrying the failure reason, the failing locations, and a bounded
// excerpt of the rejected output — then the strict parser runs again with
// no further retries. Provider errors are never repaired here: they
// propagate immediately so the retry path mints a fresh attempt.
export interface AnalysisRepairPromptInput {
	raw: string;
	reason: AnalysisValidationReason;
	issuePaths: readonly string[];
	maxRawChars?: number;
}

export function buildAnalysisRepairPrompt(
	input: AnalysisRepairPromptInput,
): string {
	const maxRawChars =
		input.maxRawChars ?? CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS;
	const excerpt =
		input.raw.length > maxRawChars
			? `${input.raw.slice(0, maxRawChars)}\n...(dipotong)`
			: input.raw;
	const locations =
		input.issuePaths.length > 0 ? input.issuePaths.join(", ") : "-";
	return [
		"Output JSON sebelumnya tidak valid. Perbaiki dan kirim ulang HANYA JSON yang valid, tanpa teks lain.",
		`Kegagalan: ${input.reason}`,
		`Lokasi masalah: ${locations}`,
		"Output sebelumnya (dipotong):",
		excerpt,
		"Peraturan perbaikan:",
		"1. Output HANYA JSON valid sesuai format awal.",
		"2. Gunakan HANYA jalur dari manifest — jangan mengarang jalur baru.",
		"3. starterSuggestions wajib tepat satu untuk setiap id: feature, bugfix, refactor, dan ui.",
		`4. Batas panjang: title maksimal ${CODEBASE_STARTER_TITLE_MAX_CHARS} karakter, description maksimal ${CODEBASE_STARTER_DESCRIPTION_MAX_CHARS} karakter, prompt maksimal ${CODEBASE_STARTER_PROMPT_MAX_CHARS} karakter.`,
		"5. Field opsional yang tidak terbukti: hilangkan field atau isi array kosong — jangan tulis null kecuali database/auth.",
		"6. Title, description, dan prompt ditulis sebagai permintaan perbaikan produk: tujuan, perilaku yang diharapkan, dan manfaat bagi pengguna. Jangan menyebut nama file, jalur file, hook, tipe data, atau algoritme di tiga field ini; pindahkan bukti teknis ke relevantPaths.",
		"7. Jangan mengubah fakta arsitektur dari output sebelumnya; hanya perbaiki bentuknya.",
	].join("\n");
}
