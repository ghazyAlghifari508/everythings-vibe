// @vitest-environment jsdom

import { setTimeout as sleep } from "node:timers/promises";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type UseChatStreamOptions,
	useChatStream,
} from "@/features/greenfield/hooks/use-chat-stream";
import { useChatStore, useUIStore } from "@/store";

const router = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => router,
	useBlocker: vi.fn(),
}));

const PRD_HEAD = "# PRD\n\n## 1. Overview\nRingkasan produk.\n\n";
const PRD_GOALS = "## 2. Goals & Success Metrics\nTarget awal.\n";

interface SseHandle {
	send(event: Record<string, unknown>): void;
	close(): void;
	fail(error: Error): void;
}
interface RecordedRequest {
	body: Record<string, unknown>;
	stream: SseHandle;
}

const encoder = new TextEncoder();
const requests: RecordedRequest[] = [];
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
const toast = vi.fn();

function openSse(): {
	readable: ReadableStream<Uint8Array>;
	handle: SseHandle;
} {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const readable = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
		},
	});
	return {
		readable,
		handle: {
			send: (event) =>
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
				),
			close: () => controller.close(),
			fail: (error) => controller.error(error),
		},
	};
}

function abortError(): Error {
	return Object.assign(new Error("Aborted"), { name: "AbortError" });
}

function runFrames() {
	const pending = [...frames.values()];
	frames.clear();
	for (const callback of pending) callback(0);
}

const tick = () =>
	act(async () => {
		await sleep(0);
	});

function setup(overrides: Partial<UseChatStreamOptions> = {}) {
	const onPrdRevised = vi.fn();
	const view = renderHook(
		(props: UseChatStreamOptions) => useChatStream(props),
		{
			initialProps: {
				projectId: "p1",
				currentPrdContent: "",
				onPrdRevised,
				...overrides,
			},
		},
	);
	return { ...view, onPrdRevised };
}

interface GenerateStarter {
	current: {
		handleSendWithMessage: (
			message: string,
			mode: "generate",
			displayMessage: string,
		) => Promise<void>;
	};
}

async function startGenerate(result: GenerateStarter): Promise<SseHandle> {
	const before = requests.length;
	await act(async () => {
		void result.current.handleSendWithMessage(
			"Buat PRD",
			"generate",
			"Buat PRD",
		);
	});
	return requests[before].stream;
}

beforeEach(() => {
	requests.length = 0;
	frames = new Map();
	nextFrameId = 1;
	router.invalidate.mockClear();
	toast.mockClear();
	window.sessionStorage.clear();
	useChatStore.getState().resetChat();
	useUIStore.setState({ showToast: toast });
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		const id = nextFrameId++;
		frames.set(id, callback);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => {
		frames.delete(id);
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: RequestInit) => {
			const { readable, handle } = openSse();
			init.signal?.addEventListener("abort", () => handle.fail(abortError()));
			requests.push({ body: JSON.parse(String(init.body)), stream: handle });
			return { ok: true, status: 200, body: readable };
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("useChatStream request-scoped routing", () => {
	it("sends generate deltas to the canvas even though the hook rendered in chat mode", async () => {
		const { result } = setup();
		const stream = await startGenerate(result);

		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD + PRD_GOALS });
		});
		await tick();
		act(() => runFrames());

		expect(useChatStore.getState().streamingPRDContent).toBe(
			PRD_HEAD + PRD_GOALS,
		);
		expect(result.current.streamingContent).toBe("");
		expect(useChatStore.getState().completedSections).toEqual(["Overview"]);
		expect(result.current.currentSection).toBe("Goals & Success Metrics");
	});

	it("keeps every delta when the last delta and done land in the same frame", async () => {
		const { result } = setup();
		const stream = await startGenerate(result);
		const parts = [
			PRD_HEAD,
			"## 2. Goals & Success Metrics\n",
			"Target awal.\n",
		];

		await act(async () => {
			for (const content of parts) stream.send({ type: "delta", content });
			stream.send({ type: "done", conversationId: "c1" });
			stream.close();
		});
		await tick();

		const full = parts.join("");
		expect(useChatStore.getState().streamingPRDContent).toBe(full);
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(result.current.isStreaming).toBe(false);
		expect(router.invalidate).toHaveBeenCalledTimes(1);

		act(() => runFrames());
		expect(useChatStore.getState().streamingPRDContent).toBe(full);
	});

	it("keeps the streamed document until the loader replaces it", async () => {
		const { result } = setup();
		const stream = await startGenerate(result);

		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD });
			stream.send({ type: "done" });
			stream.close();
		});
		await tick();

		expect(useChatStore.getState().streamingPRDContent).toBe(PRD_HEAD);
		expect(router.invalidate).toHaveBeenCalledTimes(1);
	});

	it("resumes from the partial exactly once and continues on the canvas", async () => {
		const { result } = setup();
		const first = await startGenerate(result);

		await act(async () => {
			first.send({ type: "delta", content: PRD_HEAD });
			first.send({ type: "error", error: "Provider putus" });
			first.close();
		});
		await tick();

		expect(result.current.showResumeModal).toBe(true);
		expect(result.current.resumeErrorMsg).toBe("Provider putus");
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(result.current.messages).toEqual([]);
		expect(router.invalidate).not.toHaveBeenCalled();

		await act(async () => {
			void result.current.handleResumePRD();
		});
		const resumeRequest = requests[1];
		expect(resumeRequest.body.mode).toBe("resume");
		expect(resumeRequest.body.partialContent).toBe(PRD_HEAD);

		await act(async () => {
			resumeRequest.stream.send({ type: "delta", content: PRD_GOALS });
		});
		await tick();
		act(() => runFrames());
		expect(useChatStore.getState().streamingPRDContent).toBe(
			PRD_HEAD + PRD_GOALS,
		);
		expect(result.current.streamingContent).toBe("");

		await act(async () => {
			resumeRequest.stream.send({ type: "done" });
			resumeRequest.stream.close();
		});
		await tick();
		expect(useChatStore.getState().streamingPRDContent).toBe(
			PRD_HEAD + PRD_GOALS,
		);
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(router.invalidate).toHaveBeenCalledTimes(1);
	});

	it("does not duplicate the partial when a resumed stream drops again", async () => {
		const { result } = setup();
		const first = await startGenerate(result);
		await act(async () => {
			first.send({ type: "delta", content: PRD_HEAD });
			first.send({ type: "error", error: "putus" });
			first.close();
		});
		await tick();

		await act(async () => {
			void result.current.handleResumePRD();
		});
		await act(async () => {
			requests[1].stream.send({ type: "delta", content: PRD_GOALS });
		});
		await tick();
		await act(async () => {
			requests[1].stream.fail(new TypeError("network"));
		});
		await tick();
		expect(result.current.showResumeModal).toBe(true);

		await act(async () => {
			void result.current.handleResumePRD();
		});
		expect(requests[2].body.partialContent).toBe(PRD_HEAD + PRD_GOALS);
	});

	it("revise patches the canvas and keeps only the prose in the chat bubble", async () => {
		const base = "<!-- SECTION: Overview -->\nLama\n<!-- /SECTION -->";
		const { result, onPrdRevised } = setup({ currentPrdContent: base });

		await act(async () => {
			void result.current.handleSend("Ubah overview", "revise");
		});
		const stream = requests[0].stream;
		expect(requests[0].body.mode).toBe("revise");

		await act(async () => {
			stream.send({
				type: "delta",
				content:
					"Overview diperbarui.\n:::UPDATE_SECTION[Overview]:::\nBaru\n:::END_UPDATE:::",
			});
		});
		await tick();
		act(() => runFrames());

		const canvas = useChatStore.getState().streamingPRDContent;
		expect(canvas).toContain("Baru");
		expect(canvas).not.toContain("Lama");
		expect(result.current.streamingContent).toBe("Overview diperbarui.");

		const merged = "<!-- SECTION: Overview -->\nBaru\n<!-- /SECTION -->";
		await act(async () => {
			stream.send({
				type: "done",
				content: merged,
				summaryMessage: "Overview diperbarui.",
			});
			stream.close();
		});
		await tick();

		expect(onPrdRevised).toHaveBeenCalledWith(merged);
		expect(result.current.isRevising).toBe(false);
		expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
			["user", "Ubah overview"],
			["assistant", "Overview diperbarui."],
		]);
	});

	it("chat answers stay in the chat panel and never touch the PRD canvas", async () => {
		const { result } = setup({ currentPrdContent: PRD_HEAD });

		await act(async () => {
			void result.current.handleSend("Apa itu PRD?", "chat");
		});
		const stream = requests[0].stream;
		await act(async () => {
			stream.send({ type: "delta", content: "Jawaban " });
			stream.send({ type: "delta", content: "singkat." });
		});
		await tick();
		act(() => runFrames());

		expect(result.current.streamingContent).toBe("Jawaban singkat.");
		expect(useChatStore.getState().streamingPRDContent).toBe("");

		await act(async () => {
			stream.send({ type: "done" });
			stream.close();
		});
		await tick();

		expect(result.current.messages.at(-1)).toMatchObject({
			role: "assistant",
			content: "Jawaban singkat.",
		});
		expect(useChatStore.getState().streamingPRDContent).toBe("");
		expect(router.invalidate).not.toHaveBeenCalled();
	});

	it("an error before any content reports failure without marking completion", async () => {
		const { result, onPrdRevised } = setup();
		const stream = await startGenerate(result);

		await act(async () => {
			stream.send({ type: "error", error: "Model tidak tersedia" });
			stream.close();
		});
		await tick();

		expect(toast).toHaveBeenCalledWith("Model tidak tersedia", "error");
		expect(result.current.showResumeModal).toBe(false);
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(result.current.isStreaming).toBe(false);
		expect(onPrdRevised).not.toHaveBeenCalled();
		expect(router.invalidate).not.toHaveBeenCalled();
	});

	it("Stop aborts the request and clears generation state without success handling", async () => {
		const { result } = setup();
		const stream = await startGenerate(result);
		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD });
		});
		await tick();
		act(() => runFrames());

		act(() => result.current.handleCancel());
		await tick();

		expect(toast).toHaveBeenCalledWith("Proses dihentikan.", "info");
		expect(result.current.isStreaming).toBe(false);
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(useChatStore.getState().streamingPRDContent).toBe("");
		expect(result.current.showResumeModal).toBe(false);
		expect(router.invalidate).not.toHaveBeenCalled();
	});

	it("switching project aborts the old stream and leaves no generation state behind", async () => {
		const { result, rerender, onPrdRevised } = setup();
		const stream = await startGenerate(result);
		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD });
		});
		await tick();

		rerender({ projectId: "p2", currentPrdContent: "", onPrdRevised });
		await tick();

		expect(result.current.isStreaming).toBe(false);
		expect(useChatStore.getState().isGeneratingPRD).toBe(false);
		expect(useChatStore.getState().streamingPRDContent).toBe("");
		expect(result.current.showResumeModal).toBe(false);
		expect(router.invalidate).not.toHaveBeenCalled();
	});

	it("a frame scheduled before a project switch never writes into the new project", async () => {
		const { result, rerender, onPrdRevised } = setup();
		const stream = await startGenerate(result);
		await act(async () => {
			stream.send({ type: "delta", content: PRD_HEAD });
		});
		await tick();
		expect(frames.size).toBe(1);

		rerender({ projectId: "p2", currentPrdContent: "", onPrdRevised });
		act(() => runFrames());

		expect(useChatStore.getState().streamingPRDContent).toBe("");
		expect(useChatStore.getState().completedSections).toEqual([]);
		expect(result.current.streamingContent).toBe("");
	});
});
