/**
 * `everythings-vibe export plan <projectId>` — write the canonical server
 * planning artifacts under `docs/vibeplan/`.
 *
 * The command reads the persisted PRD, AC, feature tree, and tasks through the
 * existing authenticated v1 API, then writes them atomically. It refuses to
 * export when a required artifact is missing (never an empty document), never
 * touches a file outside `docs/vibeplan/`, preserves a hand-edited file by
 * writing `<name>.vibeplan-new` beside it, and never runs any git command.
 *
 * This module never calls `process.exit` — `exportPlanCommand` owns the exit
 * code, mirroring the `codebaseSyncAction` wrapper.
 */

import { dirname, join, posix } from "node:path";
import { ApiError, apiRequest } from "../lib/api-client.js";
import { resolveApiUrl } from "../lib/config.js";
import {
	ensureDirectory,
	isPathInsideRoot,
	PLAN_EXPORT_DIR_SEGMENTS,
	readFileIfExists,
	resolvePlanExportRoot,
	writeFileAtomic,
} from "../lib/fs-atomic.js";
import {
	featurePlanDirectoryName,
	hashPlanContent,
	PLAN_EXPORT_CONFLICT_SUFFIX,
	PLAN_EXPORT_MANIFEST_FILENAME,
	type PlanExportCodebase,
	PlanExportError,
	type PlanExportFeature,
	type PlanExportFeatureTree,
	type PlanExportInput,
	type PlanExportProject,
	type PlanExportSnapshot,
	type PlanExportSubfeature,
	type PlanExportSubtask,
	type PlanExportTask,
	type PlanExportWrite,
	planExportWrites,
} from "../lib/plan-export.js";
import { resolveRepositoryRoot } from "../lib/repository.js";

export interface ExportPlanOptions {
	root?: string;
	apiUrl?: string;
	output?: "human" | "json";
}

export interface ExportPlanResult {
	ok: boolean;
	projectId: string;
	repositoryRoot?: string;
	featureDirectory?: string;
	written: string[];
	unchanged: string[];
	conflicted: string[];
	snapshotId?: string | null;
	errorCode?: string;
	errorMessage?: string;
}

/** Injectable seams used by tests; production callers omit them. */
export interface ExportPlanDeps {
	/** Override the pure planner, e.g. to prove unsafe paths are rejected. */
	planWrites?: (
		input: PlanExportInput,
		options: { exportedAt: string },
	) => PlanExportWrite[];
	/** Clock seam so idempotency assertions stay deterministic. */
	now?: () => Date;
}

const PROJECTS_API_PREFIX = "/api/v1/projects";

function projectsPath(projectId: string, suffix = ""): string {
	return `${PROJECTS_API_PREFIX}/${encodeURIComponent(projectId)}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty string, or `null` when the value does not satisfy that shape. */
function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** String of any length (including empty), or `null` when absent. */
function readText(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function parseSubtask(value: unknown): PlanExportSubtask | null {
	if (!isRecord(value)) return null;
	const name = readString(value.name);
	const status = readString(value.status);
	if (name === null || status === null) return null;
	return {
		name,
		description: readText(value.description) ?? "",
		status,
		details: readStringArray(value.details),
	};
}

function parseTask(value: unknown): PlanExportTask | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const name = readString(value.name);
	const status = readString(value.status);
	const priority = readString(value.priority);
	const featureName = readString(value.featureName);
	if (
		id === null ||
		name === null ||
		status === null ||
		priority === null ||
		featureName === null
	) {
		return null;
	}

	const rawSubtasks = value.subtasks;
	const subtasks: PlanExportSubtask[] = [];
	if (Array.isArray(rawSubtasks)) {
		for (const raw of rawSubtasks) {
			const subtask = parseSubtask(raw);
			if (subtask === null) return null;
			subtasks.push(subtask);
		}
	}

	return {
		id,
		name,
		description: readText(value.description),
		status,
		priority,
		featureName,
		dependencies: readStringArray(value.dependencies),
		covers: readStringArray(value.covers),
		surfaces: readStringArray(value.surfaces),
		startedAt: readText(value.startedAt),
		completedAt: readText(value.completedAt),
		subtasks,
	};
}

function parseSubfeature(value: unknown): PlanExportSubfeature | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const name = readString(value.name);
	const description = readText(value.description);
	if (id === null || name === null || description === null) return null;
	return { id, name, description };
}

function parseFeature(value: unknown): PlanExportFeature | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const name = readString(value.name);
	const description = readText(value.description);
	const phase = value.phase;
	if (
		id === null ||
		name === null ||
		description === null ||
		typeof phase !== "number" ||
		!Number.isFinite(phase)
	) {
		return null;
	}

	const rawSubfeatures = value.subfeatures;
	const subfeatures: PlanExportSubfeature[] = [];
	if (Array.isArray(rawSubfeatures)) {
		for (const raw of rawSubfeatures) {
			const subfeature = parseSubfeature(raw);
			if (subfeature === null) return null;
			subfeatures.push(subfeature);
		}
	}

	return { id, name, phase, description, subfeatures };
}

function parseFeatureTree(value: unknown): PlanExportFeatureTree | null {
	if (!isRecord(value)) return null;
	const productName = readString(value.productName);
	const createdAt = readString(value.createdAt);
	const rawFeatures = value.features;
	if (
		productName === null ||
		createdAt === null ||
		!Array.isArray(rawFeatures)
	) {
		return null;
	}

	const features: PlanExportFeature[] = [];
	for (const raw of rawFeatures) {
		const feature = parseFeature(raw);
		if (feature === null) return null;
		features.push(feature);
	}

	return { productName, features, createdAt };
}

function parseCodebase(value: unknown): PlanExportCodebase | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	const name = readString(value.name);
	if (id === null || name === null) return null;
	return { id, name, repositoryIdentity: readText(value.repositoryIdentity) };
}

function parseSnapshot(value: unknown): PlanExportSnapshot | null {
	if (!isRecord(value)) return null;
	const id = readString(value.id);
	if (id === null) return null;
	return {
		id,
		commitSha: readText(value.commitSha),
		branch: readText(value.branch),
		createdAt: readText(value.createdAt),
	};
}

interface ProjectDetail {
	project: PlanExportProject;
	codebase: PlanExportCodebase | null;
	snapshot: PlanExportSnapshot | null;
	featureTree: PlanExportFeatureTree | null;
}

function parseProjectDetail(payload: unknown): ProjectDetail | null {
	if (!isRecord(payload)) return null;
	const id = readString(payload.id);
	const name = readString(payload.name);
	if (id === null || name === null) return null;
	return {
		project: { id, name, step: readText(payload.step) },
		// Absent or malformed optional blocks read as "not available"; the
		// planner then fails loudly instead of writing a placeholder.
		codebase: parseCodebase(payload.codebase),
		snapshot: parseSnapshot(payload.snapshot),
		featureTree: parseFeatureTree(payload.featureTree),
	};
}

/**
 * A versioned markdown artifact. `null` means the artifact does not exist:
 * either the server answered 404, or the stored content carries no text. Both
 * cases must fail the export rather than produce an empty document.
 */
async function fetchMarkdownArtifact(
	baseUrl: string,
	projectId: string,
	suffix: "/prd" | "/ac",
): Promise<{ content: string; version: number } | null> {
	let payload: unknown;
	try {
		payload = await apiRequest<unknown>(projectsPath(projectId, suffix), {
			method: "GET",
			baseUrl,
		});
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) return null;
		throw err;
	}
	if (!isRecord(payload)) return null;

	const content = readText(payload.content);
	const version = payload.version;
	if (content === null || content.trim().length === 0) return null;
	return {
		content,
		version:
			typeof version === "number" && Number.isFinite(version) ? version : 1,
	};
}

async function fetchTasks(
	baseUrl: string,
	projectId: string,
): Promise<PlanExportTask[]> {
	const payload = await apiRequest<unknown>(projectsPath(projectId, "/tasks"), {
		method: "GET",
		baseUrl,
	});
	if (!isRecord(payload) || !Array.isArray(payload.tasks)) {
		throw new PlanExportError(
			"INVALID_TASKS_RESPONSE",
			"Response task dari server tidak sesuai kontrak, jadi export dibatalkan.",
		);
	}

	const tasks: PlanExportTask[] = [];
	for (const raw of payload.tasks) {
		const task = parseTask(raw);
		if (task === null) {
			throw new PlanExportError(
				"INVALID_TASKS_RESPONSE",
				"Response task dari server memuat task tanpa field wajib (id/name/status/priority/featureName), jadi export dibatalkan.",
			);
		}
		tasks.push(task);
	}
	return tasks;
}

interface PreviousManifest {
	exportedAt: string | null;
	/** Recorded artifact integrity hash by repository-relative path. */
	hashes: Map<string, string>;
}

/**
 * Read the integrity hashes recorded by a previous export. Used only to tell a
 * CLI-managed update from a hand-edited file; a malformed manifest yields no
 * hashes, which degrades to the normal update path.
 */
async function readPreviousManifest(
	manifestPath: string,
): Promise<PreviousManifest | null> {
	const raw = await readFileIfExists(manifestPath);
	if (raw === null) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;

	const hashes = new Map<string, string>();
	const artifacts = parsed.artifacts;
	if (isRecord(artifacts)) {
		for (const entry of Object.values(artifacts)) {
			if (!isRecord(entry)) continue;
			const file = readString(entry.file);
			const sha256 = readString(entry.sha256);
			if (file === null || sha256 === null) continue;
			hashes.set(file, sha256);
		}
	}

	return { exportedAt: readString(parsed.exportedAt), hashes };
}

interface PlannedFile extends PlanExportWrite {
	absolutePath: string;
	existingContent: string | null;
}

/** Reject the whole export when any planned path escapes its allowed root. */
function assertWritesAreContained(
	writes: readonly PlanExportWrite[],
	repositoryRoot: string,
	planRoot: string,
): void {
	for (const write of writes) {
		const absolutePath = join(repositoryRoot, ...write.relativePath.split("/"));
		if (!isPathInsideRoot(repositoryRoot, absolutePath)) {
			throw new PlanExportError(
				"UNSAFE_OUTPUT_PATH",
				`Path output "${write.relativePath}" berada di luar repository root, jadi export dibatalkan.`,
			);
		}
		if (!isPathInsideRoot(planRoot, absolutePath)) {
			throw new PlanExportError(
				"UNSAFE_OUTPUT_PATH",
				`Path output "${write.relativePath}" berada di luar ${PLAN_EXPORT_DIR_SEGMENTS.join("/")}, jadi export dibatalkan.`,
			);
		}
	}
}

async function readPlannedFiles(
	writes: readonly PlanExportWrite[],
	repositoryRoot: string,
): Promise<PlannedFile[]> {
	const planned: PlannedFile[] = [];
	for (const write of writes) {
		const absolutePath = join(repositoryRoot, ...write.relativePath.split("/"));
		planned.push({
			...write,
			absolutePath,
			existingContent: await readFileIfExists(absolutePath),
		});
	}
	return planned;
}

/** True when the file on disk no longer matches the previous manifest's hash. */
function isHandEdited(
	file: PlannedFile,
	previous: PreviousManifest | null,
): boolean {
	if (previous === null || file.existingContent === null) return false;
	const recordedHash = previous.hashes.get(file.relativePath);
	if (recordedHash === undefined) return false;
	return hashPlanContent(file.existingContent) !== recordedHash;
}

function failure(
	projectId: string,
	errorCode: string,
	errorMessage: string,
	context: {
		repositoryRoot?: string;
		featureDirectory?: string;
		written?: string[];
		unchanged?: string[];
		conflicted?: string[];
		snapshotId?: string | null;
	} = {},
): ExportPlanResult {
	return {
		ok: false,
		projectId,
		...(context.repositoryRoot
			? { repositoryRoot: context.repositoryRoot }
			: {}),
		...(context.featureDirectory
			? { featureDirectory: context.featureDirectory }
			: {}),
		written: context.written ?? [],
		unchanged: context.unchanged ?? [],
		conflicted: context.conflicted ?? [],
		...(context.snapshotId !== undefined
			? { snapshotId: context.snapshotId }
			: {}),
		errorCode,
		errorMessage,
	};
}

function toFailureContext(err: unknown): {
	errorCode: string;
	errorMessage: string;
} {
	if (err instanceof PlanExportError) {
		return { errorCode: err.code, errorMessage: err.message };
	}
	if (err instanceof ApiError) {
		return {
			errorCode: err.code ?? `HTTP_${err.status ?? "UNKNOWN"}`,
			errorMessage: err.message,
		};
	}
	return {
		errorCode: "EXPORT_FAILED",
		errorMessage: err instanceof Error ? err.message : String(err),
	};
}

function printResult(result: ExportPlanResult, output: "human" | "json"): void {
	if (output === "json") {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	const lines: string[] = [];
	if (result.repositoryRoot) {
		lines.push(`Repository   : ${result.repositoryRoot}`);
	}
	if (result.featureDirectory) {
		lines.push(`Feature dir  : ${result.featureDirectory}`);
	}

	if (!result.ok) {
		lines.push(`Export gagal [${result.errorCode}]: ${result.errorMessage}`);
		if (result.written.length > 0) {
			lines.push(`Sudah tertulis sebelum gagal: ${result.written.length} file`);
			for (const path of result.written) lines.push(`  + ${path}`);
		}
		console.log(lines.join("\n"));
		return;
	}

	if (result.snapshotId) {
		lines.push(`Snapshot     : ${result.snapshotId}`);
	}
	lines.push(`Ditulis      : ${result.written.length} file`);
	for (const path of result.written) lines.push(`  + ${path}`);
	lines.push(`Tidak berubah: ${result.unchanged.length} file`);
	for (const path of result.unchanged) lines.push(`  = ${path}`);
	if (result.conflicted.length > 0) {
		lines.push(
			`Konflik      : ${result.conflicted.length} file diedit manual; isi baru ditulis di sampingnya`,
		);
		for (const path of result.conflicted) lines.push(`  ! ${path}`);
	}
	lines.push(
		`Re-export    : everythings-vibe export plan ${result.projectId} --root .`,
	);
	console.log(lines.join("\n"));
}

export async function exportPlan(
	projectId: string,
	options: ExportPlanOptions,
	deps: ExportPlanDeps = {},
): Promise<ExportPlanResult> {
	const output: "human" | "json" = options.output ?? "human";
	if (
		projectId.trim().length === 0 ||
		(output !== "human" && output !== "json")
	) {
		const result = failure(
			projectId,
			"INVALID_OPTIONS",
			"projectId dan output (human|json) wajib diisi dengan benar.",
		);
		printResult(result, output === "json" ? "json" : "human");
		return result;
	}

	let repositoryRoot: string;
	try {
		repositoryRoot = await resolveRepositoryRoot(process.cwd(), options.root);
	} catch (err) {
		const { errorCode, errorMessage } = toFailureContext(err);
		const result = failure(projectId, errorCode, errorMessage, {});
		printResult(result, output);
		return result;
	}

	const planRoot = resolvePlanExportRoot(repositoryRoot);
	const manifestPath = join(planRoot, PLAN_EXPORT_MANIFEST_FILENAME);
	const buildWrites = deps.planWrites ?? planExportWrites;
	const now = () => (deps.now?.() ?? new Date()).toISOString();

	// Declared outside the try so a failure part-way through the write loop can
	// still report exactly which files were already written.
	const written: string[] = [];
	const unchanged: string[] = [];
	const conflicted: string[] = [];
	let featureDirectory: string | undefined;
	let snapshotId: string | null | undefined;

	try {
		const baseUrl = resolveApiUrl(options.apiUrl);

		const [detailPayload, prd, ac, tasks] = await Promise.all([
			apiRequest<unknown>(projectsPath(projectId), {
				method: "GET",
				baseUrl,
			}),
			fetchMarkdownArtifact(baseUrl, projectId, "/prd"),
			fetchMarkdownArtifact(baseUrl, projectId, "/ac"),
			fetchTasks(baseUrl, projectId),
		]);

		const detail = parseProjectDetail(detailPayload);
		if (detail === null) {
			throw new PlanExportError(
				"INVALID_PROJECT_RESPONSE",
				"Response project dari server tidak sesuai kontrak, jadi export dibatalkan.",
			);
		}

		const input: PlanExportInput = {
			project: detail.project,
			codebase: detail.codebase,
			snapshot: detail.snapshot,
			featureTree: detail.featureTree,
			prd,
			ac,
			tasks,
		};
		snapshotId = detail.snapshot?.id ?? null;

		const previous = await readPreviousManifest(manifestPath);

		// Rendering with the previous export timestamp keeps a no-op re-run
		// byte-identical. The planner throws before this point when a required
		// artifact is missing, so nothing is written for an incomplete export.
		const provisional = buildWrites(input, {
			exportedAt: previous?.exportedAt ?? now(),
		});
		assertWritesAreContained(provisional, repositoryRoot, planRoot);
		featureDirectory =
			provisional.length > 0
				? posix.dirname(provisional[0].relativePath)
				: posix.join(
						...PLAN_EXPORT_DIR_SEGMENTS,
						featurePlanDirectoryName(detail.project.name, detail.project.id),
					);

		const provisionalFiles = await readPlannedFiles(
			provisional,
			repositoryRoot,
		);
		const isNoOp = provisionalFiles.every(
			(file) => file.existingContent === file.content,
		);

		if (isNoOp) {
			const result: ExportPlanResult = {
				ok: true,
				projectId,
				repositoryRoot,
				featureDirectory,
				written: [],
				unchanged: provisional.map((write) => write.relativePath),
				conflicted: [],
				snapshotId,
			};
			printResult(result, output);
			return result;
		}

		// A real new export is happening: timestamp it now.
		const writes = buildWrites(input, { exportedAt: now() });
		assertWritesAreContained(writes, repositoryRoot, planRoot);

		await ensureDirectory(planRoot);

		const plannedFiles = await readPlannedFiles(writes, repositoryRoot);

		for (const file of plannedFiles) {
			if (file.existingContent === file.content) {
				unchanged.push(file.relativePath);
				continue;
			}

			if (isHandEdited(file, previous)) {
				const conflictPath = `${file.absolutePath}${PLAN_EXPORT_CONFLICT_SUFFIX}`;
				await ensureDirectory(dirname(conflictPath));
				await writeFileAtomic(conflictPath, file.content);
				conflicted.push(`${file.relativePath}${PLAN_EXPORT_CONFLICT_SUFFIX}`);
				continue;
			}

			await ensureDirectory(dirname(file.absolutePath));
			await writeFileAtomic(file.absolutePath, file.content);
			written.push(file.relativePath);
		}

		const result: ExportPlanResult = {
			ok: true,
			projectId,
			repositoryRoot,
			featureDirectory,
			written,
			unchanged,
			conflicted,
			snapshotId,
		};
		printResult(result, output);
		return result;
	} catch (err) {
		const { errorCode, errorMessage } = toFailureContext(err);
		const result = failure(projectId, errorCode, errorMessage, {
			repositoryRoot,
			featureDirectory,
			written,
			unchanged,
			conflicted,
			snapshotId,
		});
		printResult(result, output);
		return result;
	}
}

/**
 * Commander action for `everythings-vibe export plan`. Commander v12 camelCases
 * dashed flags (`--api-url` → `opts.apiUrl`). Owns the nonzero exit on a failed
 * export; `exportPlan` itself never exits.
 */
export async function exportPlanCommand(
	projectId: string,
	options: ExportPlanOptions,
): Promise<void> {
	const result = await exportPlan(projectId, {
		root: options.root,
		apiUrl: options.apiUrl,
		output: options.output,
	});
	if (!result.ok) process.exit(1);
}
