import { canonicalAcId } from "./ac-coverage";

/**
 * Evidence-based scope consistency validation for existing-codebase planning.
 *
 * AC coverage alone does not prove absence of scope creep: a task can cover a
 * real AC id and still describe work the repository does not need (a database
 * migration in a client-only app, a second backend for an app that already has
 * an API). This module checks each task deliverable against the available
 * evidence — the original request, confirmed answers, and the repository
 * analysis — and reports work that cannot be justified.
 *
 * Design constraints (from the FIX 09 spec):
 * - No hardcoded keyword blacklist that REJECTS output. "dashboard",
 *   "account", and "authentication" are legitimate features in other projects.
 * - A layer is flagged only when the evidence CONTRADICTS it, i.e. the task
 *   requires a capability the analysis says does not exist while nothing in the
 *   request or confirmed answers asks for it.
 * - Generalizable and deterministic. Pure: no IO, never throws, never mutates.
 *
 * The report is advisory. Callers decide what to do with it; this module never
 * deletes a task or changes persisted state.
 */

/** A technical capability whose presence must be established by evidence. */
export const SCOPE_CAPABILITY_IDS = [
	"database",
	"backend_api",
	"authentication",
] as const;

export type ScopeCapability = (typeof SCOPE_CAPABILITY_IDS)[number];

/**
 * What the repository analysis reports about a capability. `"absent"` means the
 * analysis positively found none (e.g. `database === null`); `"present"` means
 * it found one; `"unknown"` means the analysis said nothing, which can never be
 * used to flag a task.
 */
export type CapabilityState = "absent" | "present" | "unknown";

export interface ScopeEvidence {
	/** The original user request and any confirmed clarification answers. */
	requestText: string;
	/** Repository capabilities derived from the codebase analysis. */
	capabilities: Record<ScopeCapability, CapabilityState>;
	/** File paths the analysis confirms exist. Used to verify named paths. */
	knownPaths: readonly string[];
}

export type ScopeFlagReason =
	/** Task requires a capability the analysis says is absent and nothing in the request asks for it. */
	| "unsupported_capability"
	/** Task references a repository path that the analysis does not confirm. */
	| "unverified_path";

export interface ScopeFinding {
	taskName: string;
	reason: ScopeFlagReason;
	/** Normalized capability id, for `unsupported_capability`. */
	capability?: ScopeCapability;
	/** The offending path, for `unverified_path`. */
	path?: string;
}

export interface ScopeConsistencyReport {
	/** Tasks whose deliverable cannot be justified by the evidence. */
	findings: ScopeFinding[];
	/** Task names with at least one finding, de-duplicated, in document order. */
	flaggedTasks: string[];
	/** True when nothing was flagged. */
	consistent: boolean;
}

/** Minimal structural view of a task, so this module does not depend on the
 *  task-service types and stays trivially testable. */
export interface ScopeTaskView {
	name: string;
	description?: string;
	covers?: readonly string[];
	subtasks?: ReadonlyArray<{
		name?: string;
		description?: string;
		details?: readonly string[];
	}>;
}

/**
 * Capability signals. Each signal is a structural pattern the model uses when
 * it plans that capability as work. Matching only marks a task as *candidate*
 * work for a capability; the evidence then decides whether it is justified.
 */
const CAPABILITY_SIGNALS: Record<ScopeCapability, RegExp> = {
	database:
		/\b(migrat|migration|ddl|schema\s+databas|skema\s+databas|database\s+schema|tabel\s+baru|create\s+table|alter\s+table|prisma\s+migrate|drizzle-kit)\w*/i,
	backend_api:
		/\b(endpoint\s+(baru|backend)|route\s+handler\s+baru|rest\s+api\s+baru|backend\s+service|kontrak\s+api\s+baru|api\s+server\s+baru|http\s+status\s+201)\b/i,
	authentication:
		/\b(autentikasi|authentication|login|sign\s*in|register\s+user|rbac|role[- ]based|route\s+guard|session\s+management|jwt|oauth)\b/i,
};

/** "None (client-side only / external API)" → absent; anything else → present;
 *  null/undefined analysis field → unknown. Mirrors the analysis contract:
 *  `null` is a positive finding of "no database", `undefined` is silence. */
export function databaseCapabilityState(
	database: string | null | undefined,
): CapabilityState {
	if (database === null) return "absent";
	if (typeof database === "string" && database.trim().length > 0) {
		return "present";
	}
	return "unknown";
}

export function authCapabilityState(
	auth: string | null | undefined,
): CapabilityState {
	if (auth === null) return "absent";
	if (typeof auth === "string" && auth.trim().length > 0) return "present";
	return "unknown";
}

/**
 * Whether the request (original request + confirmed answers) itself asks for a
 * capability. A requested capability is always justified, regardless of whether
 * the analysis found it: the user asking for login makes auth work legitimate.
 */
function requestAsksFor(
	capability: ScopeCapability,
	requestText: string,
): boolean {
	return CAPABILITY_SIGNALS[capability].test(requestText);
}

function taskText(task: ScopeTaskView): string {
	const parts: string[] = [task.name];
	if (task.description) parts.push(task.description);
	for (const subtask of task.subtasks ?? []) {
		if (subtask.name) parts.push(subtask.name);
		if (subtask.description) parts.push(subtask.description);
		for (const detail of subtask.details ?? []) parts.push(detail);
	}
	return parts.join("\n");
}

/**
 * Repository paths the task names. Only tokens that look like a project file
 * path (contain a slash and a file extension) are considered, so prose like
 * "src/db/schema" is caught while ordinary words are ignored.
 */
const PATH_TOKEN_RE =
	/\b[\w.-]+\/[\w./-]+\.(?:tsx?|jsx?|vue|svelte|astro|css|scss|json|sql|prisma|md)\b/gi;

function namedPaths(text: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const match of text.matchAll(PATH_TOKEN_RE)) {
		const path = match[0];
		if (seen.has(path)) continue;
		seen.add(path);
		out.push(path);
	}
	return out;
}

/** Compare paths case-insensitively and with normalized separators. */
function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function isKnownPath(path: string, knownPaths: readonly string[]): boolean {
	const target = normalizePath(path);
	for (const known of knownPaths) {
		const candidate = normalizePath(known);
		if (candidate === target) return true;
		// A task may name a file inside a known directory; accept suffix
		// containment in either direction so a directory listing still counts.
		if (candidate.endsWith(`/${target}`)) return true;
		if (target.endsWith(`/${candidate}`)) return true;
	}
	return false;
}

/**
 * Validate a task list against the evidence. Pure and deterministic.
 *
 * A task is flagged for an unsupported capability only when ALL hold:
 * 1. the task's deliverable structurally requires that capability,
 * 2. the analysis positively reports the capability absent, and
 * 3. neither the request nor the confirmed answers ask for it.
 *
 * Path findings are reported separately and never block anything on their own:
 * an unverified path may simply be a proposed new file. Callers must treat a
 * path finding as advisory information, not as proof of scope creep.
 */
export function validateScopeConsistency(
	tasks: readonly ScopeTaskView[],
	evidence: ScopeEvidence,
): ScopeConsistencyReport {
	const findings: ScopeFinding[] = [];
	const flaggedTasks: string[] = [];
	const flaggedSeen = new Set<string>();

	const flag = (finding: ScopeFinding) => {
		findings.push(finding);
		if (!flaggedSeen.has(finding.taskName)) {
			flaggedSeen.add(finding.taskName);
			flaggedTasks.push(finding.taskName);
		}
	};

	for (const task of tasks) {
		const text = taskText(task);

		for (const capability of SCOPE_CAPABILITY_IDS) {
			if (evidence.capabilities[capability] !== "absent") continue;
			if (requestAsksFor(capability, evidence.requestText)) continue;
			if (!CAPABILITY_SIGNALS[capability].test(text)) continue;
			flag({
				taskName: task.name,
				reason: "unsupported_capability",
				capability,
			});
		}

		if (evidence.knownPaths.length > 0) {
			for (const path of namedPaths(text)) {
				if (isKnownPath(path, evidence.knownPaths)) continue;
				flag({ taskName: task.name, reason: "unverified_path", path });
			}
		}
	}

	return {
		findings,
		flaggedTasks,
		consistent: findings.length === 0,
	};
}

/** Every AC id referenced by the flagged tasks. Used to scope a bounded repair
 *  round: only tasks that cannot be justified are sent back for revision. */
export function flaggedTaskCovers(
	tasks: readonly ScopeTaskView[],
	report: ScopeConsistencyReport,
): string[] {
	const flagged = new Set(report.flaggedTasks);
	const out: string[] = [];
	const seen = new Set<string>();
	for (const task of tasks) {
		if (!flagged.has(task.name)) continue;
		for (const id of task.covers ?? []) {
			const canonical = canonicalAcId(id);
			if (seen.has(canonical)) continue;
			seen.add(canonical);
			out.push(canonical);
		}
	}
	return out;
}

/** Human-readable Indonesian summary for the SSE stream / logs. */
export function describeScopeFindings(report: ScopeConsistencyReport): string {
	if (report.consistent) return "";
	return report.findings
		.map((finding) => {
			if (finding.reason === "unsupported_capability") {
				return `${finding.taskName} (kapabilitas ${finding.capability} tidak didukung bukti/repositori)`;
			}
			return `${finding.taskName} (path belum terverifikasi: ${finding.path})`;
		})
		.join("; ");
}
