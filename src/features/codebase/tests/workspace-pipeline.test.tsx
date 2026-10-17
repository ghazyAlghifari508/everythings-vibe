// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	CodebasePipelineStage,
	CodebaseRunState,
} from "@/features/codebase/services/chat-flow";
import { useWorkspacePipeline } from "../hooks/use-workspace-pipeline";

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

const doneStream = () =>
	new Response(
		'data: {"type":"thinking","content":"reason"}\n\ndata: {"type":"delta","content":"document"}\n\ndata: {"type":"done"}\n\n',
	);
afterEach(() => vi.unstubAllGlobals());

describe("workspace generation streams", () => {
	it("deduplicates same-render submissions and waits for persisted content", async () => {
		let finish: (response: Response) => void = () => {};
		const pending = new Promise<Response>((resolve) => {
			finish = resolve;
		});
		const fetcher = vi.fn(() => pending);
		vi.stubGlobal("fetch", fetcher);
		const reload = vi.fn(async () => true);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			const first = result.current.generate("prd", "/api/chat", {}, reload);
			const duplicate = result.current.generate("prd", "/api/chat", {}, reload);
			expect(fetcher).toHaveBeenCalledTimes(1);
			expect(reload).not.toHaveBeenCalled();
			finish(doneStream());
			await Promise.all([first, duplicate]);
		});
		expect(reload).toHaveBeenCalledTimes(1);
		expect(result.current.run?.status).toBe("done");
		expect(result.current.run?.thinkingText).toBe("reason");
		expect(result.current.busy).toBeNull();
		unmount();
	});

	it("does not report success when stream completion has no persisted artifact", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => doneStream()),
		);
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
		expect(result.current.busy).toBeNull();
		unmount();
	});

	it("reports truncated streams without reloading or advancing", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response('data: {"type":"delta","content":"partial"}\n\n'),
			),
		);
		const reload = vi.fn(async () => true);
		const { result, unmount } = renderHook(usePipeline);
		await act(async () => {
			await result.current.generate("task", "/api/task/generate", {}, reload);
		});
		expect(reload).not.toHaveBeenCalled();
		expect(result.current.run?.status).toBe("failed");
		expect(result.current.error).not.toBeNull();
		expect(result.current.busy).toBeNull();
		unmount();
	});
});
