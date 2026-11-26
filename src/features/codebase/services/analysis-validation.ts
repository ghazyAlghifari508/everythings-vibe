import { extractJson } from "@/lib/services/json-extract";
import { findStarterTechnicalLeaks } from "./analysis-prompt";
import {
	ANALYSIS_VALIDATION_MESSAGE,
	type AnalysisValidationReason,
	type CodebaseAnalysis,
	type CodebaseAnalysisFinding,
	codebaseAnalysisGenerationSchema,
	codebaseAnalysisSchema,
} from "./analysis-schema";

/**
 * Clean and verify architectural findings against snapshot manifest:
 * - Exclude untrusted / fabricated file paths so missing evidence does not become a fake citation.
 * - Deduplicate findings by title.
 * - Reclassify claimType when evidence is missing or uncertain.
 * - Eliminate duplicated uncertainty that parrots the finding's title or detail.
 */
export function sanitizeAnalysisFindings(
	findings: readonly CodebaseAnalysisFinding[] | undefined,
	trustedManifestPaths: ReadonlySet<string>,
): CodebaseAnalysisFinding[] | undefined {
	if (!findings || findings.length === 0) return undefined;

	const seenTitles = new Set<string>();
	const sanitized: CodebaseAnalysisFinding[] = [];

	for (const finding of findings) {
		const titleKey = finding.title.trim().toLowerCase();
		if (!titleKey || seenTitles.has(titleKey)) continue;
		seenTitles.add(titleKey);

		// Filter paths against trusted manifest paths
		const rawPaths = [
			...(finding.evidencePaths ?? []),
			...(finding.relevantPaths ?? []),
		];
		const validPaths = Array.from(
			new Set(rawPaths.filter((path) => trustedManifestPaths.has(path))),
		);

		let claimType = finding.claimType;
		if (claimType === "verified" && validPaths.length === 0) {
			claimType = finding.uncertainty ? "uncertain" : "inference";
		} else if (!claimType) {
			if (finding.uncertainty && finding.uncertainty.trim().length > 0) {
				claimType = "uncertain";
			} else if (validPaths.length > 0) {
				claimType = "verified";
			} else {
				claimType = "inference";
			}
		}

		// Avoid duplicated uncertainty that merely parrots title or detail
		let uncertainty = finding.uncertainty?.trim();
		if (uncertainty) {
			const uLower = uncertainty.toLowerCase();
			if (
				uLower === titleKey ||
				uLower === finding.detail.trim().toLowerCase()
			) {
				uncertainty = undefined;
			}
		}

		const implication = finding.implication ?? finding.impact;

		sanitized.push({
			title: finding.title.trim(),
			detail: finding.detail.trim(),
			claimType,
			...(uncertainty ? { uncertainty } : {}),
			...(validPaths.length > 0
				? { evidencePaths: validPaths, relevantPaths: validPaths }
				: {}),
			...(implication ? { implication } : {}),
		});
	}

	return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Deduplicate limitations and filter items that repeat finding uncertainties.
 */
export function sanitizeAnalysisLimitations(
	limitations: readonly string[] | undefined,
	findings: readonly CodebaseAnalysisFinding[] | undefined,
): string[] | undefined {
	if (!limitations || limitations.length === 0) return undefined;

	const seen = new Set<string>();
	if (findings) {
		for (const f of findings) {
			if (f.uncertainty) seen.add(f.uncertainty.trim().toLowerCase());
			seen.add(f.title.trim().toLowerCase());
		}
	}

	const result: string[] = [];
	for (const item of limitations) {
		const trimmed = item.trim();
		const lower = trimmed.toLowerCase();
		if (!trimmed || seen.has(lower)) continue;
		seen.add(lower);
		result.push(trimmed);
	}

	return result.length > 0 ? result : undefined;
}

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
	"applicationModules",
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
	const sanitizedRelevantFiles = result.data.relevantFiles
		? result.data.relevantFiles.filter((p) => trustedManifestPaths.has(p))
		: undefined;
	const sanitizedFindings = sanitizeAnalysisFindings(
		result.data.findings,
		trustedManifestPaths,
	);
	const sanitizedLimitations = sanitizeAnalysisLimitations(
		result.data.limitations,
		sanitizedFindings,
	);

	return {
		...result.data,
		...(sanitizedRelevantFiles !== undefined
			? { relevantFiles: sanitizedRelevantFiles }
			: {}),
		...(sanitizedFindings !== undefined
			? { findings: sanitizedFindings }
			: { findings: undefined }),
		...(sanitizedLimitations !== undefined
			? { limitations: sanitizedLimitations }
			: { limitations: undefined }),
	};
}
