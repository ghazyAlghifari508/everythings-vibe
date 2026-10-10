import { describe, expect, it, type Mock, vi } from "vitest";
import {
	AnalysisValidationError,
	buildAnalysisRepairPrompt,
	generateValidatedAnalysis,
	parseAnalysisOutput,
	type ValidatedGenerationInput,
} from "./codebase-analysis";
import {
	CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS,
	CODEBASE_STARTER_DESCRIPTION_MAX_CHARS,
	CODEBASE_STARTER_PROMPT_MAX_CHARS,
	CODEBASE_STARTER_TITLE_MAX_CHARS,
} from "./constants";

const ids = { projectId: "proj_repair", snapshotId: "snap_repair" };
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

function validRaw() {
	return JSON.stringify({
		framework: "ContohFW",
		starterSuggestions: [
			suggestion("feature"),
			suggestion("bugfix"),
			suggestion("refactor"),
			suggestion("ui"),
		],
	});
}

type Generate = ValidatedGenerationInput["generate"];
type Message = ValidatedGenerationInput["messages"][number];

function makeGenerate(impl: Generate): Mock<Generate> {
	return vi.fn(impl);
}

const messages: Message[] = [
	{ role: "system", content: "format JSON" },
	{ role: "user", content: "analisis snapshot" },
];

describe("generateValidatedAnalysis", () => {
	it("returns the first output when it already validates", async () => {
		const generate = makeGenerate(async () => validRaw());
		const result = await generateValidatedAnalysis({
			generate,
			messages,
			ids,
			trustedManifestPaths,
		});
		expect(result.framework).toBe("ContohFW");
		expect(generate).toHaveBeenCalledTimes(1);
	});

	it("repairs a contract miss once and returns the corrected output", async () => {
		const broken = JSON.stringify({
			framework: "ContohFW",
			starterSuggestions: [
				suggestion("feature"),
				suggestion("bugfix"),
				suggestion("refactor"),
			],
		});
		const generate = makeGenerate(async () => validRaw());
		generate.mockResolvedValueOnce(broken);
		const result = await generateValidatedAnalysis({
			generate,
			messages,
			ids,
			trustedManifestPaths,
		});
		expect(generate).toHaveBeenCalledTimes(2);
		expect(result.starterSuggestions).toHaveLength(4);
	});

	it("sends the failure reason and locations with the repair request", async () => {
		const broken = "{ not json {{{";
		const generate = makeGenerate(async () => validRaw());
		generate.mockResolvedValueOnce(broken);
		await generateValidatedAnalysis({
			generate,
			messages,
			ids,
			trustedManifestPaths,
		});
		expect(generate).toHaveBeenCalledTimes(2);
		const repairMessages = generate.mock.calls[1]?.[0];
		if (!repairMessages) throw new Error("missing repair call");
		const lastRepair = repairMessages[repairMessages.length - 1];
		if (!lastRepair) throw new Error("missing repair message");
		expect(lastRepair.content).toContain("invalid_json");
		expect(lastRepair.content).toContain("manifest");
	});

	it("fails closed after exactly one repair attempt", async () => {
		const broken = JSON.stringify({ framework: 42 });
		const generate = makeGenerate(async () => broken);
		try {
			await generateValidatedAnalysis({
				generate,
				messages,
				ids,
				trustedManifestPaths,
			});
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("schema");
		}
		expect(generate).toHaveBeenCalledTimes(2);
	});

	it("never repairs provider errors and propagates them immediately", async () => {
		const failure = new Error("Respons kosong dari chunk model.");
		const generate = makeGenerate(async () => {
			throw failure;
		});
		await expect(
			generateValidatedAnalysis({
				generate,
				messages,
				ids,
				trustedManifestPaths,
			}),
		).rejects.toBe(failure);
		expect(generate).toHaveBeenCalledTimes(1);
	});

	it("re-validates trusted paths on the repaired output", async () => {
		const untrusted = JSON.stringify({
			starterSuggestions: [
				suggestion("feature", { relevantPaths: ["src/elsewhere.ts"] }),
				suggestion("bugfix"),
				suggestion("refactor"),
				suggestion("ui"),
			],
		});
		const generate = makeGenerate(async () => untrusted);
		try {
			await generateValidatedAnalysis({
				generate,
				messages,
				ids,
				trustedManifestPaths,
			});
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			if (!(error instanceof AnalysisValidationError)) throw error;
			expect(error.reason).toBe("untrusted_paths");
		}
		expect(generate).toHaveBeenCalledTimes(2);
	});
});

describe("buildAnalysisRepairPrompt", () => {
	it("bounds the echoed output and states the length contract", () => {
		const prompt = buildAnalysisRepairPrompt({
			raw: "y".repeat(CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS + 500),
			reason: "schema",
			issuePaths: ["starterSuggestions.0.title"],
		});
		expect(prompt).toContain("starterSuggestions.0.title");
		expect(prompt).toContain("manifest");
		expect(prompt).toContain(String(CODEBASE_STARTER_TITLE_MAX_CHARS));
		expect(prompt).toContain(String(CODEBASE_STARTER_DESCRIPTION_MAX_CHARS));
		expect(prompt).toContain(String(CODEBASE_STARTER_PROMPT_MAX_CHARS));
		expect(prompt.length).toBeLessThan(
			CODEBASE_ANALYSIS_REPAIR_MAX_RAW_CHARS + 2000,
		);
	});

	it("repairs without inventing success for still-invalid output", () => {
		const prompt = buildAnalysisRepairPrompt({
			raw: "{ broken",
			reason: "invalid_json",
			issuePaths: [],
		});
		expect(() =>
			parseAnalysisOutput(prompt, ids, trustedManifestPaths),
		).toThrow(AnalysisValidationError);
	});
});
