import { describe, expect, it } from "vitest";
import {
	ANALYSIS_VALIDATION_MESSAGE,
	AnalysisValidationError,
	type AnalysisValidationReason,
	classifyAnalysisFailure,
	formatAnalysisDiagnosticLog,
	parseAnalysisOutput,
	toSafeAnalysisErrorMessage,
} from "./codebase-analysis";
import { AnalysisServiceError } from "./codebase-analysis.server";
import { CODEBASE_STARTER_TITLE_MAX_CHARS } from "./constants";

const ids = { projectId: "proj_diag", snapshotId: "snap_diag" };
const trustedManifestPaths = new Set([
	"src/feature.ts",
	"src/bugfix.ts",
	"src/refactor.ts",
	"src/ui.ts",
]);

function suggestion(
	id: "feature" | "bugfix" | "refactor" | "ui",
	overrides: Record<string, unknown> = {},
) {
	return {
		id,
		title: `Tugas ${id}`,
		description: `Deskripsi singkat ${id}.`,
		prompt: `Kerjakan tugas ${id} mengikuti pola pada snapshot.`,
		relevantPaths: [`src/${id}.ts`],
		...overrides,
	};
}

function validPayload(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		framework: "ContohFW",
		language: "ContohLang",
		starterSuggestions: [
			suggestion("feature"),
			suggestion("bugfix"),
			suggestion("refactor"),
			suggestion("ui"),
		],
		...overrides,
	});
}

describe("analysis failure classification", () => {
	it("maps provider outages to provider", () => {
		const cases = [
			"Semua model AI sedang tidak tersedia. Coba lagi dalam beberapa menit. (boom)",
			"Respons kosong dari chunk model.",
			"request failed with status 429",
			"fetch failed: ECONNREFUSED",
		];
		for (const message of cases) {
			expect(classifyAnalysisFailure(new Error(message))).toBe("provider");
		}
	});

	it("maps watchdog expiries to timeout", () => {
		const cases = [
			"AI tidak merespons dalam 2 menit. Coba generate ulang.",
			"Generasi melebihi batas waktu. Coba lagi dengan prompt lebih ringkas.",
		];
		for (const message of cases) {
			expect(classifyAnalysisFailure(new Error(message))).toBe("timeout");
		}
	});

	it("maps aborts to aborted", () => {
		expect(classifyAnalysisFailure(new Error("AI stream aborted"))).toBe(
			"aborted",
		);
	});

	it("maps a not-uploaded snapshot guard to snapshot", () => {
		const error = new AnalysisServiceError(
			"SNAPSHOT_NOT_UPLOADED",
			"Snapshot belum siap dianalisis. Selesaikan sync terlebih dahulu.",
		);
		expect(classifyAnalysisFailure(error)).toBe("snapshot");
	});

	it("maps persistence-stage failures without another signal to persistence", () => {
		expect(classifyAnalysisFailure(new Error("boom"), "persist")).toBe(
			"persistence",
		);
	});

	it("maps anything else to unknown", () => {
		expect(classifyAnalysisFailure(new Error("boom"))).toBe("unknown");
		expect(classifyAnalysisFailure(null)).toBe("unknown");
	});
});

describe("validation failure reasons", () => {
	it("labels malformed JSON as invalid_json with the raw length", () => {
		const raw = "{ truncated json {{{";
		try {
			parseAnalysisOutput(raw, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("invalid_json");
			expect(error.rawLength).toBe(raw.length);
			expect(error.message).toBe(ANALYSIS_VALIDATION_MESSAGE);
		}
	});

	it("labels truncated model output as invalid_json", () => {
		const full = validPayload();
		const truncated = full.slice(0, Math.floor(full.length / 2));
		try {
			parseAnalysisOutput(truncated, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("invalid_json");
		}
	});

	it("labels schema mismatches with actionable issue paths", () => {
		const raw = validPayload({
			starterSuggestions: [
				suggestion("feature", {
					title: "x".repeat(CODEBASE_STARTER_TITLE_MAX_CHARS + 1),
				}),
				suggestion("bugfix"),
				suggestion("refactor"),
				suggestion("ui"),
			],
		});
		try {
			parseAnalysisOutput(raw, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("schema");
			expect(
				error.issuePaths.some((path) => path.includes("starterSuggestions")),
			).toBe(true);
			expect(error.message).toBe(ANALYSIS_VALIDATION_MESSAGE);
		}
	});

	it("labels duplicated starter ids as schema", () => {
		const raw = validPayload({
			starterSuggestions: [
				suggestion("feature"),
				suggestion("feature"),
				suggestion("refactor"),
				suggestion("ui"),
			],
		});
		try {
			parseAnalysisOutput(raw, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("schema");
		}
	});

	it("labels invented suggestion paths as untrusted_paths", () => {
		const raw = validPayload({
			starterSuggestions: [
				suggestion("feature", { relevantPaths: ["src/elsewhere.ts"] }),
				suggestion("bugfix"),
				suggestion("refactor"),
				suggestion("ui"),
			],
		});
		try {
			parseAnalysisOutput(raw, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("untrusted_paths");
			expect(error.issuePaths).toContain("src/elsewhere.ts");
		}
	});

	it("labels implementation detail in user-facing starter copy as technical_leak", () => {
		const raw = validPayload({
			starterSuggestions: [
				suggestion("feature", {
					title: "Rapikan lib/widgets/panel.tsx",
					description: "Perbaiki widget.",
					prompt:
						"Buka lib/widgets/panel.tsx dan pindahkan state ke useMemo agar lebih cepat.",
				}),
				suggestion("bugfix"),
				suggestion("refactor"),
				suggestion("ui"),
			],
		});
		try {
			parseAnalysisOutput(raw, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("technical_leak");
			// Locations only: the diagnostics log must never echo model text.
			expect(error.issuePaths).toEqual([
				"starterSuggestions.feature.title",
				"starterSuggestions.feature.prompt",
			]);
		}
	});

	it("tolerates prompt-declared nulls in advisory fields", () => {
		const raw = validPayload({
			summary: null,
			framework: null,
			language: null,
			packageManager: null,
			dependencies: null,
		});
		const result = parseAnalysisOutput(raw, ids, trustedManifestPaths);
		expect(result.framework).toBeUndefined();
		expect(result.language).toBeUndefined();
		expect(result.packageManager).toBeUndefined();
		expect(result.dependencies).toBeUndefined();
		expect(result.starterSuggestions).toHaveLength(4);
	});

	it("keeps required contracts strict despite null tolerance", () => {
		const nullSuggestions = validPayload({ starterSuggestions: null });
		expect(() =>
			parseAnalysisOutput(nullSuggestions, ids, trustedManifestPaths),
		).toThrow(AnalysisValidationError);
		const nullTitle = validPayload({
			starterSuggestions: [
				suggestion("feature", { title: null }),
				suggestion("bugfix"),
				suggestion("refactor"),
				suggestion("ui"),
			],
		});
		expect(() =>
			parseAnalysisOutput(nullTitle, ids, trustedManifestPaths),
		).toThrow(AnalysisValidationError);
	});

	it("classifies validation errors by their reason", () => {
		const reasons: AnalysisValidationReason[] = [
			"invalid_json",
			"schema",
			"untrusted_paths",
			"technical_leak",
		];
		for (const reason of reasons) {
			const error = new AnalysisValidationError({ reason, rawLength: 12 });
			expect(classifyAnalysisFailure(error)).toBe(reason);
		}
	});

	it("keeps the user-facing message fixed for every failure", () => {
		for (const error of [
			new Error("sk-secret stack trace"),
			new AnalysisValidationError({ reason: "schema", rawLength: 9 }),
			"raw string",
			null,
		]) {
			const message = toSafeAnalysisErrorMessage(error);
			expect(message).toMatch(/gagal|coba/i);
			expect(message).not.toContain("sk-secret");
			expect(message).not.toContain("raw string");
		}
		const validation = new AnalysisValidationError({
			reason: "schema",
			rawLength: 9,
		});
		expect(validation.message).toBe(ANALYSIS_VALIDATION_MESSAGE);
	});
});

describe("diagnostic log record", () => {
	it("carries attempt, category, duration, and issue paths without raw output", () => {
		const record = formatAnalysisDiagnosticLog({
			attemptId: "attempt_1",
			projectId: "proj_diag",
			snapshotId: "snap_diag",
			category: "schema",
			durationMs: 4242,
			issuePaths: ["starterSuggestions.0.title"],
			rawLength: 9100,
		});
		expect(record.attemptId).toBe("attempt_1");
		expect(record.category).toBe("schema");
		expect(record.durationMs).toBe(4242);
		expect(record.issuePaths).toEqual(["starterSuggestions.0.title"]);
		expect(record.rawLength).toBe(9100);
		expect("raw" in record).toBe(false);
		expect("output" in record).toBe(false);
		expect(JSON.stringify(record)).not.toContain("sk-secret");
	});

	it("omits empty optional fields", () => {
		const record = formatAnalysisDiagnosticLog({
			attemptId: "attempt_2",
			projectId: "proj_diag",
			snapshotId: "snap_diag",
			category: "provider",
			durationMs: 120000,
		});
		expect("issuePaths" in record).toBe(false);
		expect("rawLength" in record).toBe(false);
	});
});
