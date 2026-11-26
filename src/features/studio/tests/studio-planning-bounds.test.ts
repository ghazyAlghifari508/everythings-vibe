import { afterEach, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import { generateStudioPlan } from "../services/studio-planning-generation";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["fixture"],
	tryStreamWithFallback: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
const input = {
	systemPrompt: "schema",
	prompt: "Synthetic product brief",
	designMode: "web" as const,
	count: 1,
	requireVisualDirection: false,
	signal: new AbortController().signal,
	timing: { jobId: "job", projectId: "project" },
};
const response = (raw: string, finishReason = "stop") => ({
	firstChunk: raw,
	generator: (async function* () {})(),
	abortController: new AbortController(),
	outcome: { finishReason },
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.mocked(tryStreamWithFallback).mockReset();
});

it("stops after one invalid JSON correction", async () => {
	vi.mocked(tryStreamWithFallback).mockImplementation(async () =>
		response("invalid JSON"),
	);
	await expect(generateStudioPlan(input)).rejects.toMatchObject({
		code: "STUDIO_CONTRACT_VIOLATION",
	});
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(2);
});

it("backs off transient failures but never exceeds three planning requests", async () => {
	const attempts: number[] = [];
	vi.mocked(tryStreamWithFallback).mockImplementation(async () => {
		attempts.push(Date.now());
		throw new Error("429 rate limit");
	});
	await expect(generateStudioPlan(input)).rejects.toThrow("429");
	expect(attempts).toHaveLength(3);
	expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(450);
	expect(attempts[2] - attempts[1]).toBeGreaterThanOrEqual(950);
});

it("shares the request ceiling between transient retries and invalid JSON correction", async () => {
	vi.mocked(tryStreamWithFallback)
		.mockRejectedValueOnce(new Error("503 unavailable"))
		.mockResolvedValueOnce(response("invalid"))
		.mockResolvedValueOnce(response("still invalid"));
	await expect(generateStudioPlan(input)).rejects.toMatchObject({
		code: "STUDIO_CONTRACT_VIOLATION",
	});
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(3);
});

it("does not correct filtered provider output", async () => {
	vi.mocked(tryStreamWithFallback).mockResolvedValue(
		response("filtered", "content-filter"),
	);
	await expect(generateStudioPlan(input)).rejects.toMatchObject({
		code: "STUDIO_PROVIDER_UNAVAILABLE",
	});
	expect(tryStreamWithFallback).toHaveBeenCalledTimes(1);
});

it("does not make any provider request after cancellation", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(
		generateStudioPlan({ ...input, signal: controller.signal }),
	).rejects.toThrow();
	expect(tryStreamWithFallback).not.toHaveBeenCalled();
});
