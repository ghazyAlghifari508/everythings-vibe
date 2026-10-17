import { extractJson } from "@/lib/services/json-extract";
import { findStarterTechnicalLeaks } from "./analysis-prompt";
import {
	ANALYSIS_VALIDATION_MESSAGE,
	type AnalysisValidationReason,
	type CodebaseAnalysis,
	codebaseAnalysisGenerationSchema,
	codebaseAnalysisSchema,
} from "./analysis-schema";

export function parseCodebaseAnalysis(input: unknown): CodebaseAnalysis {
	return codebaseAnalysisSchema.parse(input);
}

export function safeParseCodebaseAnalysis(input: unknown) {
	return codebaseAnalysisSchema.safeParse(input);
}

// === Model output validation ===
// Server identities are injected AFTER parsing: model-provided projectId /
// snapshotId are discarded so a rogue completion cannot rebind the analysis
// to another project or snapshot.

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

// Advisory top-level fields the system prompt declares nullable-or-omittable
// when the snapshot proves nothing. A model that writes null for one of
// these is following the prompt, so the reader normalizes null to absent
// before the strict schema runs. Required contracts (starterSuggestions and
// every field inside them) stay strict: null there still fails.
const NULLABLE_ADVISORY_KEYS = [
	"summary",
	"framework",
	"language",
	"packageManager",
	"dependencies",
	"moduleMap",
	"relevantFiles",
	"impactAreas",
	"limitations",
	"findings",
] as const;

function normalizeNullAdvisoryFields(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const normalized = { ...record };
	for (const key of NULLABLE_ADVISORY_KEYS) {
		if (normalized[key] === null) normalized[key] = undefined;
	}
	if (normalized.summary === "") normalized.summary = undefined;
	return normalized;
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
		...normalizeNullAdvisoryFields(rest),
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
	const leaks = findStarterTechnicalLeaks(result.data.starterSuggestions);
	if (leaks.length > 0) {
		throw new AnalysisValidationError({
			reason: "technical_leak",
			rawLength: raw.length,
			issuePaths: leaks.slice(0, MAX_DIAGNOSTIC_ISSUE_PATHS),
		});
	}
	return result.data;
}
