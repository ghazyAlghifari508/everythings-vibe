/**
 * Pure planning + rendering for `everythings-vibe export plan`.
 *
 * No filesystem writes happen here: the module turns validated server
 * artifacts into the exact set of files (and contents) the command writes.
 * Every output path is derived from `PLAN_EXPORT_DIR_SEGMENTS`, the feature
 * directory name, and the fixed filenames below.
 */

import { createHash } from "node:crypto";
import { posix } from "node:path";
import { PLAN_EXPORT_DIR_SEGMENTS } from "./fs-atomic.js";

/** Manifest schema version. Bumped only when the manifest shape changes. */
export const PLAN_EXPORT_MANIFEST_SCHEMA_VERSION = 1;
/** Upper bound for a feature slug so directory names stay portable. */
export const PLAN_EXPORT_SLUG_MAX_LENGTH = 60;
/** Characters of the project id used to keep similarly-named features apart. */
export const PLAN_EXPORT_SHORT_ID_LENGTH = 8;
/** Slug used when a feature name yields no usable characters. */
export const PLAN_EXPORT_SLUG_FALLBACK = "fitur";

export const PLAN_EXPORT_MANIFEST_FILENAME = "manifest.json";
export const PLAN_EXPORT_FEATURE_FILENAME = "feature.md";
export const PLAN_EXPORT_PRD_FILENAME = "PRD.md";
export const PLAN_EXPORT_AC_FILENAME = "AC.md";
export const PLAN_EXPORT_TASKS_FILENAME = "tasks.json";
export const PLAN_EXPORT_HANDOFF_FILENAME = "HANDOFF.md";
/** Sibling suffix used when a hand-edited file must not be overwritten. */
export const PLAN_EXPORT_CONFLICT_SUFFIX = ".vibeplan-new";

/**
 * Feature-tree shape mirrored from `src/db/schema.ts` (`ProjectFeatureTree`).
 * Duplicated because the standalone CLI package never imports from `src/`.
 */
export interface PlanExportSubfeature {
	id: string;
	name: string;
	description: string;
}

export interface PlanExportFeature {
	id: string;
	name: string;
	phase: number;
	description: string;
	subfeatures: PlanExportSubfeature[];
}

export interface PlanExportFeatureTree {
	productName: string;
	features: PlanExportFeature[];
	createdAt: string;
}

/**
 * Task shape mirrored from the `GET /api/v1/projects/:id/tasks` response.
 * Values are carried through untouched: the export never regenerates tasks.
 */
export interface PlanExportSubtask {
	name: string;
	description: string;
	status: string;
	details: string[];
}

export interface PlanExportTask {
	id: string;
	name: string;
	description: string | null;
	status: string;
	priority: string;
	featureName: string;
	dependencies: string[];
	covers: string[];
	surfaces: string[];
	startedAt: string | null;
	completedAt: string | null;
	subtasks: PlanExportSubtask[];
}

export interface PlanExportProject {
	id: string;
	name: string;
	step: string | null;
}

export interface PlanExportCodebase {
	id: string;
	name: string;
	repositoryIdentity: string | null;
}

export interface PlanExportSnapshot {
	id: string;
	commitSha: string | null;
	branch: string | null;
	createdAt: string | null;
}

export interface PlanExportInput {
	project: PlanExportProject;
	codebase: PlanExportCodebase | null;
	snapshot: PlanExportSnapshot | null;
	featureTree: PlanExportFeatureTree | null;
	prd: { content: string; version: number } | null;
	ac: { content: string; version: number } | null;
	tasks: readonly PlanExportTask[];
}

export type PlanExportArtifactKind =
	| "feature"
	| "prd"
	| "ac"
	| "tasks"
	| "handoff"
	| "manifest";

export interface PlanExportWrite {
	relativePath: string;
	content: string;
}

/** Artifact kinds whose content is exported as a file inside the feature dir. */
export type PlanExportArtifactFileKind = Exclude<
	PlanExportArtifactKind,
	"manifest"
>;

/**
 * Raised when a required planning artifact is missing or empty. The export
 * refuses to continue rather than writing a placeholder document.
 */
export class PlanExportError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "PlanExportError";
		this.code = code;
	}
}

/** SHA-256 hex of exported content; the manifest records one per artifact. */
export function hashPlanContent(content: string): string {
	return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Lowercase ASCII slug: non-alphanumeric runs become a single `-`, edges are
 * trimmed, and the result is capped. Feature names are Indonesian, so the
 * fallback covers names made entirely of characters outside `[a-z0-9]`.
 */
export function slugifyFeatureName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, PLAN_EXPORT_SLUG_MAX_LENGTH)
		.replace(/-+$/g, "");
	return slug.length > 0 ? slug : PLAN_EXPORT_SLUG_FALLBACK;
}

/** Short, stable, name-independent project identity fragment. */
function shortProjectId(projectId: string): string {
	return projectId
		.slice(0, PLAN_EXPORT_SHORT_ID_LENGTH)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

/**
 * `<slug>-<short-project-id>` so two similarly-named features never share a
 * directory. The project id is the stable identity; the name is mutable, so it
 * may only contribute the human-readable prefix.
 */
export function featurePlanDirectoryName(
	name: string,
	projectId: string,
): string {
	const slug = slugifyFeatureName(name);
	const shortId = shortProjectId(projectId);
	return shortId.length > 0 ? `${slug}-${shortId}` : slug;
}

/** Relative path of a file inside the feature directory, always `/`-joined. */
function featureFileRelativePath(
	featureDirectory: string,
	fileName: string,
): string {
	return posix.join(...PLAN_EXPORT_DIR_SEGMENTS, featureDirectory, fileName);
}

/** Relative path of the manifest at the export root. */
function manifestRelativePath(): string {
	return posix.join(...PLAN_EXPORT_DIR_SEGMENTS, PLAN_EXPORT_MANIFEST_FILENAME);
}

function bullet(label: string, value: string): string {
	return `- **${label}:** ${value}`;
}

/** Identity block shared by the rendered documents. */
function documentHeaderLines(input: PlanExportInput): string[] {
	const { project, codebase, snapshot } = input;
	const lines = [
		bullet("Project ID", project.id),
		bullet("Feature plan", project.name),
		bullet("Tahap", project.step ?? "belum diketahui"),
	];
	if (codebase) {
		lines.push(bullet("Codebase", `${codebase.name} (${codebase.id})`));
		if (codebase.repositoryIdentity) {
			lines.push(bullet("Repository", codebase.repositoryIdentity));
		}
	}
	if (snapshot) {
		lines.push(
			bullet(
				"Snapshot",
				[
					snapshot.id,
					snapshot.branch ?? "branch tidak diketahui",
					snapshot.commitSha ?? "commit SHA tidak diketahui",
				].join(" · "),
			),
		);
	}
	return lines;
}

/**
 * Full Feature Specification from the persisted feature tree. Every feature,
 * its phase, description, and every subfeature are written out; this is not a
 * summary.
 */
export function renderFeatureDocument(input: PlanExportInput): string {
	const tree = input.featureTree;
	if (!tree) {
		throw new PlanExportError(
			"FEATURE_TREE_MISSING",
			`Feature Specification belum tersedia untuk project ${input.project.id}, jadi feature.md tidak bisa ditulis.`,
		);
	}

	const lines: string[] = [
		`# Feature Specification: ${tree.productName}`,
		"",
		...documentHeaderLines(input),
		bullet("Feature tree dibuat", tree.createdAt),
		"",
	];

	if (tree.features.length === 0) {
		lines.push(
			"Feature tree tersimpan tidak memuat satu pun fitur, jadi belum ada Feature Specification yang bisa diimplementasikan.",
			"",
		);
		return lines.join("\n");
	}

	lines.push("## Daftar Fitur", "");

	for (let i = 0; i < tree.features.length; i += 1) {
		const feature = tree.features[i];
		lines.push(`### ${i + 1}. ${feature.name}`, "");
		lines.push(bullet("Feature ID", feature.id));
		lines.push(bullet("Phase", String(feature.phase)), "");
		lines.push(feature.description, "");

		if (feature.subfeatures.length === 0) {
			lines.push("_Fitur ini belum memiliki subfeature._", "");
			continue;
		}

		lines.push("#### Subfeature", "");
		for (const subfeature of feature.subfeatures) {
			lines.push(`- **${subfeature.name}** (\`${subfeature.id}\`)`);
			lines.push(`  - ${subfeature.description}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

/** Complete PRD, verbatim, behind a short identity header. */
export function renderPrdDocument(input: PlanExportInput): string {
	if (!input.prd) {
		throw new PlanExportError(
			"PRD_MISSING",
			`PRD belum tersedia untuk project ${input.project.id}, jadi PRD.md tidak bisa ditulis.`,
		);
	}

	const lines: string[] = [
		`# PRD: ${input.project.name} (versi ${input.prd.version})`,
		"",
		...documentHeaderLines(input),
		"",
		"---",
		"",
		input.prd.content,
	];
	return lines.join("\n");
}

/** Complete Acceptance Criteria, verbatim, behind a short identity header. */
export function renderAcDocument(input: PlanExportInput): string {
	if (!input.ac) {
		throw new PlanExportError(
			"AC_MISSING",
			`Acceptance Criteria belum tersedia untuk project ${input.project.id}, jadi AC.md tidak bisa ditulis.`,
		);
	}

	const lines: string[] = [
		`# Acceptance Criteria: ${input.project.name} (versi ${input.ac.version})`,
		"",
		...documentHeaderLines(input),
		"",
		"---",
		"",
		input.ac.content,
	];
	return lines.join("\n");
}

/**
 * Server task snapshot. Field order is explicit so the JSON contract stays
 * stable; values are the server's, never re-derived.
 */
export function renderTasksDocument(
	input: PlanExportInput,
	options: { exportedAt: string },
): string {
	if (input.tasks.length === 0) {
		throw new PlanExportError(
			"TASKS_MISSING",
			`Task belum tersedia untuk project ${input.project.id}, jadi tasks.json tidak bisa ditulis.`,
		);
	}

	const tasks = input.tasks.map((task) => ({
		id: task.id,
		name: task.name,
		description: task.description,
		priority: task.priority,
		status: task.status,
		featureName: task.featureName,
		dependencies: task.dependencies,
		covers: task.covers,
		surfaces: task.surfaces,
		startedAt: task.startedAt,
		completedAt: task.completedAt,
		subtasks: task.subtasks.map((subtask) => ({
			name: subtask.name,
			description: subtask.description,
			status: subtask.status,
			details: subtask.details,
		})),
	}));

	return `${JSON.stringify(
		{
			projectId: input.project.id,
			featureName: input.project.name,
			exportedAt: options.exportedAt,
			taskCount: tasks.length,
			tasks,
		},
		null,
		2,
	)}\n`;
}

/** Read order the coding agent should follow before touching source code. */
function planningReadOrder(
	featureDirectory: string,
	artifactFiles: readonly string[],
): string[] {
	const ordered: string[] = [];
	const preferred = [
		PLAN_EXPORT_HANDOFF_FILENAME,
		PLAN_EXPORT_FEATURE_FILENAME,
		PLAN_EXPORT_PRD_FILENAME,
		PLAN_EXPORT_AC_FILENAME,
		PLAN_EXPORT_TASKS_FILENAME,
	];
	for (const fileName of preferred) {
		const match = artifactFiles.find(
			(path) => posix.basename(path) === fileName,
		);
		ordered.push(match ?? featureFileRelativePath(featureDirectory, fileName));
	}
	return ordered;
}

/**
 * Operational instructions for a coding agent, in Indonesian with technical
 * terms in English. Deliberately does not restate the PRD.
 */
export function renderHandoffDocument(
	input: PlanExportInput,
	options: { artifactFiles: readonly string[]; reExportCommand: string },
): string {
	const { project, codebase, snapshot } = input;
	const featureDirectory = featurePlanDirectoryName(project.name, project.id);
	const [handoff, feature, prd, ac, tasks] = planningReadOrder(
		featureDirectory,
		options.artifactFiles,
	);

	const lines: string[] = [
		`# Handoff Implementasi: ${project.name}`,
		"",
		...documentHeaderLines(input),
		"",
		"## 1. Identitas Repository & Feature Plan",
		"",
		"Pastikan kamu bekerja di repository yang benar sebelum mengubah apa pun.",
		"Kalau repository atau feature plan di bawah ini tidak cocok dengan yang sedang dibuka, hentikan pekerjaan dan konfirmasi ke user.",
		"",
		bullet("Project ID", `\`${project.id}\``),
		bullet("Feature plan", project.name),
	];
	if (codebase) {
		lines.push(bullet("Codebase", `${codebase.name} (\`${codebase.id}\`)`));
		if (codebase.repositoryIdentity) {
			lines.push(
				bullet("Repository identity", `\`${codebase.repositoryIdentity}\``),
			);
		}
	}
	if (snapshot) {
		lines.push(
			bullet("Snapshot", `\`${snapshot.id}\``),
			bullet("Branch", snapshot.branch ?? "tidak diketahui"),
			bullet("Commit SHA", snapshot.commitSha ?? "tidak diketahui"),
		);
	}
	lines.push(
		"",
		"## 2. File Planning Yang Harus Dibaca",
		"",
		"Baca berurutan, jangan melompat ke task sebelum memahami requirement:",
		"",
		`1. \`${handoff}\` — instruksi operasional ini.`,
		`2. \`${feature}\` — Feature Specification: daftar fitur dan subfeature yang menjadi scope.`,
		`3. \`${prd}\` — PRD lengkap: requirements, user flow, page/screen inventory, tech stack, constraints.`,
		`4. \`${ac}\` — Acceptance Criteria: kriteria verifikasi per requirement.`,
		`5. \`${tasks}\` — snapshot task beserta dependency, subtask, \`covers\`, dan \`surfaces\`.`,
		"",
		"Jangan membuat ulang PRD, AC, atau task. Semua artefak di atas adalah hasil planning yang sudah tersimpan di everythings-vibe.",
		"",
		"## 3. Scope Implementasi",
		"",
		"- Implementasikan hanya fitur dan subfeature yang tercantum di Feature Specification dan PRD.",
		"- Setiap task mencantumkan requirement yang harus dipenuhi di field `covers` dan surface yang disentuh di field `surfaces`. Implementasikan semuanya, bukan hanya happy path: loading, empty, error, validation, dan authorization.",
		"- Jangan menambah halaman, endpoint, atau role yang tidak diminta PRD/AC.",
		"- Jangan menyederhanakan requirement agar cepat selesai.",
		"",
		"## 4. Urutan Pengerjaan Task",
		"",
		"1. Kerjakan task sesuai dependency-nya. Task yang punya `dependencies` belum boleh dimulai sebelum task yang direferensikan selesai.",
		"2. Selesaikan task dalam satu `featureName` secara berurutan sebelum berpindah fitur.",
		"3. Selesaikan seluruh `subtasks` sebuah task sebelum menandai task-nya selesai.",
		"",
		"Ambil task berikutnya dan perbarui statusnya lewat CLI, bukan dengan mengedit file JSON:",
		"",
		"```bash",
		`everythings-vibe task next ${project.id}`,
		`everythings-vibe task update <taskId> --status in_progress`,
		`everythings-vibe subtask update <taskId> --index <i> --status in_progress`,
		`everythings-vibe task update <taskId> --status completed`,
		`everythings-vibe kanban ${project.id}`,
		"```",
		"",
		`Status yang diterima: \`pending\`, \`in_progress\`, \`completed\`, \`failed\`. Lihat board lengkap dengan \`everythings-vibe kanban ${project.id}\`.`,
		"",
		"## 5. Verifikasi Pekerjaan",
		"",
		"- Cocokkan setiap perubahan dengan PRD dan Acceptance Criteria sebelum menandai task selesai.",
		"- Periksa seluruh point AC yang tercantum di `covers` task tersebut, termasuk jalur error dan validasi.",
		"- Jalankan typecheck, lint, dan test repository ini. Jangan tandai task `completed` selama verifikasi belum lulus.",
		"- Kalau sebuah requirement tidak bisa dipenuhi, tandai task `failed` beserta alasannya di laporan ke user. Jangan menandai `completed` tanpa bukti.",
		"",
		"## 6. Batasan Arsitektur",
		"",
		"- Pertahankan arsitektur, pola, dan konvensi repository yang sudah ada. Ini codebase existing, bukan greenfield.",
		"- Reuse komponen, service, util, dan schema yang sudah ada sebelum membuat yang baru.",
		"- Ikuti `AGENTS.md` dan rule repository untuk testing, commit, dan push. Handoff ini tidak menggantikan instruksi repository tersebut.",
		"- Perubahan harus sesedikit mungkin dan terisolasi pada scope feature plan ini.",
		"",
		"## 7. Source of Truth & Re-Export",
		"",
		`- \`${tasks}\` adalah snapshot planning saat export, bukan sumber kebenaran. Status task yang otoritatif tetap di backend everythings-vibe.`,
		"- Jangan menjadikan edit manual pada file snapshot sebagai cara melaporkan progress. Selalu pakai CLI di atas.",
		"- Kalau planning berubah di workspace (PRD, AC, atau task direvisi), jalankan re-export berikut supaya file lokal ikut terbarui:",
		"",
		"```bash",
		options.reExportCommand,
		"```",
		"",
		"- Re-export hanya memperbarui folder feature ini. File yang sudah kamu edit manual tidak akan ditimpa; versi barunya ditulis sebagai `<nama>.vibeplan-new` di sebelahnya.",
		"- Export tidak pernah menjalankan `git add`, `git commit`, atau `git push`. Tanggung jawab commit tetap pada kamu, sesuai aturan repository.",
		"",
	);

	return lines.join("\n");
}

/** Manifest artifact entry: the written path plus its integrity hash. */
interface ManifestArtifactEntry {
	file: string;
	sha256: string;
	version?: number;
	taskCount?: number;
}

function findArtifactFile(
	artifactFiles: readonly string[],
	fileName: string,
): string {
	const match = artifactFiles.find((path) => posix.basename(path) === fileName);
	if (!match) {
		throw new PlanExportError(
			"ARTIFACT_FILE_MISSING",
			`File artefak ${fileName} tidak ada dalam daftar export, jadi manifest.json tidak bisa dibangun.`,
		);
	}
	return match;
}

/**
 * `manifest.json` content: identity, artifact index with integrity hashes, and
 * the re-export command. Carries no credential, token, or absolute local path.
 */
export function buildManifestEntry(
	input: PlanExportInput,
	options: { artifactFiles: readonly string[]; exportedAt: string },
): string {
	const { project, codebase, snapshot, prd, ac } = input;
	const featureDirectory = featurePlanDirectoryName(project.name, project.id);

	const artifacts: Record<string, ManifestArtifactEntry> = {
		feature: {
			file: findArtifactFile(
				options.artifactFiles,
				PLAN_EXPORT_FEATURE_FILENAME,
			),
			sha256: hashPlanContent(renderFeatureDocument(input)),
		},
	};
	if (prd) {
		artifacts.prd = {
			file: findArtifactFile(options.artifactFiles, PLAN_EXPORT_PRD_FILENAME),
			sha256: hashPlanContent(renderPrdDocument(input)),
			version: prd.version,
		};
	}
	if (ac) {
		artifacts.ac = {
			file: findArtifactFile(options.artifactFiles, PLAN_EXPORT_AC_FILENAME),
			sha256: hashPlanContent(renderAcDocument(input)),
			version: ac.version,
		};
	}
	artifacts.tasks = {
		file: findArtifactFile(options.artifactFiles, PLAN_EXPORT_TASKS_FILENAME),
		sha256: hashPlanContent(
			renderTasksDocument(input, { exportedAt: options.exportedAt }),
		),
		taskCount: input.tasks.length,
	};
	artifacts.handoff = {
		file: findArtifactFile(options.artifactFiles, PLAN_EXPORT_HANDOFF_FILENAME),
		sha256: hashPlanContent(
			renderHandoffDocument(input, {
				artifactFiles: options.artifactFiles,
				reExportCommand: buildReExportCommand(project.id),
			}),
		),
	};

	const manifest = {
		schemaVersion: PLAN_EXPORT_MANIFEST_SCHEMA_VERSION,
		exportedAt: options.exportedAt,
		projectId: project.id,
		projectName: project.name,
		featureDirectory,
		codebase: codebase
			? {
					id: codebase.id,
					name: codebase.name,
					repositoryIdentity: codebase.repositoryIdentity,
				}
			: null,
		snapshot: snapshot
			? {
					id: snapshot.id,
					commitSha: snapshot.commitSha,
					branch: snapshot.branch,
					createdAt: snapshot.createdAt,
				}
			: null,
		artifacts,
		reExportCommand: buildReExportCommand(project.id),
	};

	return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Command that regenerates this export after planning changes. */
export function buildReExportCommand(projectId: string): string {
	return `everythings-vibe export plan ${projectId} --root .`;
}

/**
 * Every file an export writes, in write order. Throws `PlanExportError` when a
 * required artifact is missing, so a partial or empty export is impossible.
 */
export function planExportWrites(
	input: PlanExportInput,
	options: { exportedAt: string },
): PlanExportWrite[] {
	const featureDirectory = featurePlanDirectoryName(
		input.project.name,
		input.project.id,
	);
	const reExportCommand = buildReExportCommand(input.project.id);

	const featureRelativePath = featureFileRelativePath(
		featureDirectory,
		PLAN_EXPORT_FEATURE_FILENAME,
	);
	const prdRelativePath = featureFileRelativePath(
		featureDirectory,
		PLAN_EXPORT_PRD_FILENAME,
	);
	const acRelativePath = featureFileRelativePath(
		featureDirectory,
		PLAN_EXPORT_AC_FILENAME,
	);
	const tasksRelativePath = featureFileRelativePath(
		featureDirectory,
		PLAN_EXPORT_TASKS_FILENAME,
	);
	const handoffRelativePath = featureFileRelativePath(
		featureDirectory,
		PLAN_EXPORT_HANDOFF_FILENAME,
	);
	const artifactFiles = [
		featureRelativePath,
		prdRelativePath,
		acRelativePath,
		tasksRelativePath,
		handoffRelativePath,
	];

	return [
		{
			relativePath: featureRelativePath,
			content: renderFeatureDocument(input),
		},
		{ relativePath: prdRelativePath, content: renderPrdDocument(input) },
		{ relativePath: acRelativePath, content: renderAcDocument(input) },
		{
			relativePath: tasksRelativePath,
			content: renderTasksDocument(input, options),
		},
		{
			relativePath: handoffRelativePath,
			content: renderHandoffDocument(input, {
				artifactFiles,
				reExportCommand,
			}),
		},
		{
			relativePath: manifestRelativePath(),
			content: buildManifestEntry(input, {
				artifactFiles,
				exportedAt: options.exportedAt,
			}),
		},
	];
}
