/**
 * Task tree contract: the `TaskTree` type, JSON parsing/validation, and
 * AC coverage evaluation. Pure — no database access — so the generation
 * pipeline and the persistence layer can share one contract.
 *
 * Schema fork: old normalized `features`/`tasks`/`subtasks` tables collapsed
 * into flat `tasks` (project_id, title, description, subtasks jsonb, order).
 * The TaskTree shape (features→tasks→subtasks) is reconstructed from rows:
 * each feature = grouping by convention; here we store one task row per feature
 * with its subtasks as jsonb, since the flat schema has no feature grouping.
 */
import {
	type AcCoverageReport,
	buildCoverageReport,
	canonicalAcId,
	extractAcIds,
	extractReferencedAcIds,
} from "@/features/greenfield/utils/ac-coverage";
import {
	normalizeTaskPriority,
	type TaskPriority,
} from "@/features/greenfield/utils/task-priority";

export interface TaskTree {
	features: Array<{
		name: string;
		tasks: Array<{
			name: string;
			description: string;
			// Present on trees loaded from the database via getTaskTree;
			// absent on trees freshly parsed from AI JSON (read as pending).
			status?: string;
			/** Product-impact classification decided by Task generation. */
			priority: TaskPriority;
			/** Requirement ids this task delivers, e.g. ["AC-1.1", "AC-1.2"]. */
			covers: string[];
			/**
			 * Page/Screen inventory entries this task implements, using the names
			 * declared by the PRD's `User Flow → Pages & Screens`. Empty when the
			 * task touches no user-facing surface (or the PRD predates the
			 * inventory). Definitions stay in the PRD; this is a reference only.
			 */
			surfaces: string[];
			/**
			 * Subfeature this task implements, referencing the project feature
			 * tree (`subfeat-N.M`). Required on freshly generated trees when
			 * the caller passes the tree's id set; absent on legacy trees
			 * generated before the Fitur stage existed.
			 */
			subfeatureId?: string;
			subfeatureName?: string;
			subtasks: Array<{ name: string; description: string; details: string[] }>;
		}>;
	}>;
}

export const MAX_TASK_NAME_CHARS = 500;
export const MAX_TASK_DESC_CHARS = 5000;
const MAX_SURFACES = 50;

/** Surface references are labels, not prose; bound each one before persisting. */
export function normalizeSurfaceName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.replace(/\s+/g, " ").trim();
	if (!name || name.length > MAX_TASK_NAME_CHARS) return null;
	return name;
}

/**
 * Read a task's `surfaces` field. Absent is valid — a task may touch no
 * user-facing surface — while a present-but-malformed field is a contract
 * violation and rejects the payload.
 */
function parseSurfaces(
	value: unknown,
): { ok: true; surfaces: string[] } | { ok: false } {
	if (value === undefined || value === null) return { ok: true, surfaces: [] };
	if (!Array.isArray(value)) return { ok: false };
	const out: string[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		const name = normalizeSurfaceName(entry);
		if (!name) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
		if (out.length >= MAX_SURFACES) break;
	}
	return { ok: true, surfaces: out };
}

/**
 * Legacy fallback: task trees generated before the `covers` field existed only
 * carry prose references such as "(Cover AC-1.1, AC-1.2)" in the description.
 * Reading them keeps already-persisted projects valid instead of reporting
 * every legacy requirement as missing.
 */
export function coversFromLegacyDescription(description: string): string[] {
	return extractReferencedAcIds(description);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, max: number): value is string {
	return typeof value === "string" && !!value.trim() && value.length <= max;
}

export function parseTaskJson(
	jsonString: string,
	validSubfeatureIds?: ReadonlySet<string>,
): TaskTree | null {
	try {
		const parsed: unknown = JSON.parse(jsonString);
		if (!isRecord(parsed)) return null;
		const { features } = parsed;
		if (!Array.isArray(features) || features.length === 0) return null;
		// Rebuild a validated tree instead of trusting + casting the raw
		// payload: every persisted string field is verified here.
		const out: TaskTree = { features: [] };
		for (const feature of features) {
			if (!isRecord(feature)) return null;
			if (!isNonEmptyString(feature.name, MAX_TASK_NAME_CHARS)) return null;
			if (!Array.isArray(feature.tasks)) return null;
			const outFeature: TaskTree["features"][number] = {
				name: feature.name.trim(),
				tasks: [],
			};
			for (const task of feature.tasks) {
				if (!isRecord(task)) return null;
				if (!isNonEmptyString(task.name, MAX_TASK_NAME_CHARS)) return null;
				if (
					task.description !== undefined &&
					(typeof task.description !== "string" ||
						task.description.length > MAX_TASK_DESC_CHARS)
				)
					return null;
				if (!Array.isArray(task.subtasks)) return null;
				// Priority is part of the generation contract: a new tree must
				// state a known level, so an absent or invented value is rejected
				// instead of silently falling back to the storage default.
				const priority = normalizeTaskPriority(task.priority);
				if (!priority) return null;
				const surfacesResult = parseSurfaces(task.surfaces);
				if (!surfacesResult.ok) return null;
				// Fitur SSOT: a fresh generation must anchor every task to a
				// subfeature from the project feature tree. An absent set means
				// a legacy path (old tests, stored trees) where the field
				// stays absent instead of failing.
				let subfeatureId: string | undefined;
				let subfeatureName: string | undefined;
				if (validSubfeatureIds) {
					if (
						typeof task.subfeatureId !== "string" ||
						!validSubfeatureIds.has(task.subfeatureId.trim())
					)
						return null;
					subfeatureId = task.subfeatureId.trim();
					if (
						task.subfeatureName !== undefined &&
						typeof task.subfeatureName === "string" &&
						task.subfeatureName.trim().length > 0 &&
						task.subfeatureName.length <= MAX_TASK_NAME_CHARS
					)
						subfeatureName = task.subfeatureName.trim();
				} else if (
					typeof task.subfeatureId === "string" &&
					task.subfeatureId.trim().length > 0
				) {
					subfeatureId = task.subfeatureId.trim();
					if (
						task.subfeatureName !== undefined &&
						typeof task.subfeatureName === "string" &&
						task.subfeatureName.trim().length > 0 &&
						task.subfeatureName.length <= MAX_TASK_NAME_CHARS
					)
						subfeatureName = task.subfeatureName.trim();
				}
				// Coverage is structural when present. A legacy tree without the
				// field falls back to prose references so it stays readable.
				let covers: string[];
				if (task.covers === undefined) {
					covers = coversFromLegacyDescription(
						typeof task.description === "string" ? task.description : "",
					);
				} else {
					if (!Array.isArray(task.covers)) return null;
					const collected: string[] = [];
					const seen = new Set<string>();
					for (const entry of task.covers) {
						if (typeof entry !== "string") return null;
						const trimmed = entry.trim();
						if (!trimmed) continue;
						if (trimmed.length > MAX_TASK_NAME_CHARS) return null;
						// Accept both a bare id and a stray prose reference, but
						// only keep tokens that really are AC identifiers.
						const ids = extractReferencedAcIds(trimmed);
						if (ids.length === 0) continue;
						for (const id of ids) {
							const canonical = canonicalAcId(id);
							if (seen.has(canonical)) continue;
							seen.add(canonical);
							collected.push(canonical);
						}
					}
					covers = collected;
				}
				const outTask: TaskTree["features"][number]["tasks"][number] = {
					name: task.name.trim(),
					description:
						typeof task.description === "string" ? task.description : "",
					priority,
					covers,
					surfaces: surfacesResult.surfaces,
					...(subfeatureId ? { subfeatureId } : {}),
					...(subfeatureName ? { subfeatureName } : {}),
					subtasks: [],
				};
				for (const subtask of task.subtasks) {
					if (!isRecord(subtask)) return null;
					if (!isNonEmptyString(subtask.name, MAX_TASK_NAME_CHARS)) return null;
					if (
						subtask.description !== undefined &&
						(typeof subtask.description !== "string" ||
							subtask.description.length > MAX_TASK_DESC_CHARS)
					)
						return null;
					const details = subtask.details === undefined ? [] : subtask.details;
					if (
						!Array.isArray(details) ||
						!details.every(
							(d): d is string =>
								typeof d === "string" && d.length <= MAX_TASK_DESC_CHARS,
						)
					)
						return null;
					outTask.subtasks.push({
						name: subtask.name.trim(),
						description:
							typeof subtask.description === "string"
								? subtask.description
								: "",
						details: [...details],
					});
				}
				outFeature.tasks.push(outTask);
			}
			out.features.push(outFeature);
		}
		return out;
	} catch {
		return null;
	}
}

/**
 * Every requirement id declared by the tree, in tree order. Legacy tasks
 * (persisted before `covers` existed) contribute their prose references so a
 * stored tree is validated on the same terms as a freshly parsed one.
 */
export function collectDeclaredCovers(taskTree: TaskTree): string[] {
	const out: string[] = [];
	for (const feature of taskTree.features) {
		for (const task of feature.tasks) {
			if (task.covers.length > 0) {
				out.push(...task.covers);
				continue;
			}
			out.push(...coversFromLegacyDescription(task.description));
		}
	}
	return out;
}

/**
 * Verify that a generated tree delivers every requirement defined by the
 * authoritative AC document. The model's claim is not trusted: coverage is
 * read from the structured `covers` field and compared to the identifiers the
 * AC document actually defines.
 */
export function evaluateTaskCoverage(
	taskTree: TaskTree,
	acMarkdown: string,
): AcCoverageReport {
	return buildCoverageReport({
		declared: collectDeclaredCovers(taskTree),
		defined: extractAcIds(acMarkdown),
	});
}
