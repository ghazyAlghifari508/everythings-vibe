// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	CodebasePipelineStage,
	CodebaseRunStage,
	CodebaseRunState,
} from "@/features/codebase/services/chat-flow";
import { useWorkspacePipeline } from "../hooks/use-workspace-pipeline";

function operation(
	stage: CodebaseRunStage,
	status: "queued" | "running" | "completed" | "failed" | "cancelled",
	overrides: Record<string, unknown> = {},
) {
	return {
		id: "op-1",
		projectId: "plan-a",
		stage,
		status,
		result: status === "completed" ? { content: "document" } : null,
		error: status === "failed" ? "Generasi gagal" : null,
		errorCode: null,
		artifactId: status === "completed" ? "artifact-1" : null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		startedAt: null,
		finishedAt: null,
		...overrides,
	};
}

interface FetchStep {
	method: "POST" | "GET";
	operation: unknown;
	status?: number;
}

function stubDurableFetch(steps: FetchStep[]) {
	const requests: Array<{ method: string; url: string; body?: unknown }> = [];
	const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		requests.push({
			method,
			url,
			body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
		});
		const step = steps.shift();
		if (!step) throw new Error("unexpected request");
		if (step.status && step.status >= 400)
			return Response.json({ error: "Server error" }, { status: step.status });
		return method === "POST"
			? Response.json({ operation: step.operation })
			: Response.json({ operation: step.operation });
	});
	vi.stubGlobal("fetch", fetcher);
	return { fetcher, requests };
}

function usePipeline() {
	const [busy, setBusy] = useState<CodebasePipelineStage | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [run, setRun] = useState<CodebaseRunState | null>(null);
	const project = useRef<string | null>("plan-a");
	const generate = useWorkspacePipeline({
		effectiveFeatureId: "plan-a",
		stageBusy: busy,
		activeProjectIdRef: project,
		setStageBusy: setBusy,
		setStageError: setError,
		setRun,
	});
	return { generate, busy, error, run, project };
}

afterEach(() => vi.unstubAllGlobals());

describe("durable workspace generation pipeline", () => {
	it("submits a durable operation and only reports success with persisted content", async () => {
		const { requests } = stubDurableFetch([
			{ method: "POST", operation: operation("prd", "completed") },
		]);
		const reload = vi.fn(async () => true);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate("prd", "/api/chat", {}, reload);
		});
		expect(requests[0]?.url).toContain("/api/codebase/generation");
		expect(requests[0]?.method).toBe("POST");
		expect(reload).toHaveBeenCalledTimes(1);
		expect(result.current.run?.status).toBe("done");
		expect(result.current.busy).toBeNull();
		unmount();
	});

	it("does not report success when the persisted artifact cannot be loaded", async () => {
		stubDurableFetch([
			{ method: "POST", operation: operation("ac", "completed") },
		]);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate(
				"ac",
				"/api/ac/generate",
				{},
				async () => false,
			);
		});
		expect(result.current.run?.status).toBe("failed");
		expect(result.current.error).not.toBeNull();
		expect(result.current.busy).toBeNull();
		unmount();
	});

	it("polls a queued operation until it settles before loading the artifact", async () => {
		stubDurableFetch([
			{ method: "POST", operation: operation("task", "queued") },
			{
				method: "GET",
				operation: operation("task", "completed", { result: { ok: true } }),
			},
		]);
		const reload = vi.fn(async () => true);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate("task", "/api/task/generate", {}, reload);
		});
		expect(reload).toHaveBeenCalledTimes(1);
		expect(result.current.run?.status).toBe("done");
		unmount();
	});

	it("settles a failed operation with the server error and never loads artifacts", async () => {
		stubDurableFetch([
			{ method: "POST", operation: operation("prd", "failed") },
		]);
		const reload = vi.fn(async () => true);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate("prd", "/api/chat", {}, reload);
		});
		expect(reload).not.toHaveBeenCalled();
		expect(result.current.run?.status).toBe("failed");
		expect(result.current.error).toBe("Generasi gagal");
		unmount();
	});

	it("deduplicates same-render submissions into a single durable request", async () => {
		let release: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const fetcher = vi.fn(async (_input: string | URL, init?: RequestInit) => {
			await gate;
			return init?.method === "POST"
				? Response.json({ operation: operation("prd", "completed") })
				: Response.json({ operation: operation("prd", "completed") });
		});
		vi.stubGlobal("fetch", fetcher);
		const reload = vi.fn(async () => true);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			const first = result.current.generate("prd", "/api/chat", {}, reload);
			const duplicate = result.current.generate("prd", "/api/chat", {}, reload);
			expect(fetcher).toHaveBeenCalledTimes(1);
			release?.();
			await Promise.all([first, duplicate]);
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(reload).toHaveBeenCalledTimes(1);
		expect(result.current.run?.status).toBe("done");
		expect(result.current.busy).toBeNull();
		unmount();
	});

	it("drops a completion that arrives after the user left the project", async () => {
		let release: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const fetcher = vi.fn(async () => {
			await gate;
			return Response.json({ operation: operation("prd", "completed") });
		});
		vi.stubGlobal("fetch", fetcher);
		const reload = vi.fn(async () => true);
		const { result } = renderHook(usePipeline);
		await act(async () => {
			const request = result.current.generate("prd", "/api/chat", {}, reload);
			result.current.project.current = null;
			release?.();
			await request;
		});
		expect(reload).not.toHaveBeenCalled();
	});

	it("propagates the explicit retry flag to the durable submission", async () => {
		const { requests } = stubDurableFetch([
			{ method: "POST", operation: operation("prd", "completed") },
		]);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate(
				"prd",
				"/api/chat",
				{},
				async () => true,
				true,
			);
		});
		expect(requests[0]?.body).toMatchObject({ retry: true, stage: "prd" });
		unmount();
	});

	it("restores a usable error when the server rejects acceptance", async () => {
		stubDurableFetch([{ method: "POST", operation: null, status: 503 }]);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate(
				"feature",
				"/api/features/generate",
				{},
				async () => true,
			);
		});
		expect(result.current.run?.status).toBe("failed");
		expect(result.current.busy).toBeNull();
		unmount();
	});
});
