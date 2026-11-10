// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceComposer } from "../hooks/use-workspace-composer";

function setup(
	overrides: Partial<Parameters<typeof useWorkspaceComposer>[0]> = {},
) {
	const input = {
		codebase: { id: "repo", name: "Repository" },
		snapshotReady: true,
		isWorking: false,
		setIsWorking: vi.fn(),
		setError: vi.fn(),
		setActiveFeature: vi.fn(),
		setPipelineStage: vi.fn(),
		setFeatureTree: vi.fn(),
		setTaskTree: vi.fn(),
		setPrdContent: vi.fn(),
		setAcContent: vi.fn(),
		setChatAnswers: vi.fn(),
		persistMessage: vi.fn(async () => {}),
		effectiveFeatureId: "a",
		onboardingFeatureId: "anchor",
		artifactCount: 4,
		isCreatingNew: true,
		setIsCreatingNew: vi.fn(),
		setLastFeaturePrompt: vi.fn(),
		fetchAiQuestions: vi.fn(async () => {}),
		runRevision: vi.fn(async () => {}),
		resetFeatureWorkspace: vi.fn(),
		registerCreatedPlan: vi.fn(),
		...overrides,
	};
	return {
		input,
		...renderHook(
			({ id }) => useWorkspaceComposer({ ...input, effectiveFeatureId: id }),
			{ initialProps: { id: input.effectiveFeatureId } },
		),
	};
}
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("enters empty creation without a database request", () => {
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	const { result, input } = setup();
	act(() => result.current.handleCreateFeature());
	expect(input.resetFeatureWorkspace).toHaveBeenCalledOnce();
	expect(input.setActiveFeature).toHaveBeenCalledWith(null);
	expect(fetcher).not.toHaveBeenCalled();
});
it("deduplicates first-prompt submits and clarifies the new project, not A", async () => {
	let finish: (response: Response) => void = () => {};
	const pending = new Promise<Response>((resolve) => {
		finish = resolve;
	});
	const fetcher = vi.fn(() => pending);
	vi.stubGlobal("fetch", fetcher);
	const { result, input } = setup();
	await act(async () => {
		const first = result.current.handleSendMessage("New feature request");
		const duplicate = result.current.handleSendMessage("New feature request");
		expect(fetcher).toHaveBeenCalledOnce();
		finish(Response.json({ projectId: "b", name: "Feature B" }));
		expect(await first).toBe(true);
		expect(await duplicate).toBe(false);
	});
	expect(input.fetchAiQuestions).toHaveBeenCalledWith(
		"b",
		"New feature request",
	);
	expect(input.registerCreatedPlan).toHaveBeenCalledWith({
		id: "b",
		name: "Feature B",
	});
	expect(input.runRevision).not.toHaveBeenCalled();
});
it("retries an uncertain creation with the same request identity", async () => {
	const fetcher = vi.fn(async (_url: string, _init: RequestInit) =>
		Response.json({}, { status: 503 }),
	);
	vi.stubGlobal("fetch", fetcher);
	const { result } = setup();
	await act(async () => {
		await result.current.handleSendMessage("Feature request");
	});
	await act(async () => {
		await result.current.handleSendMessage("Feature request");
	});
	const bodies = fetcher.mock.calls.map(([, init]) =>
		JSON.parse(String(init.body)),
	);
	expect(bodies).toHaveLength(2);
	expect(bodies[0].requestId).toEqual(expect.any(String));
	expect(bodies[1].requestId).toBe(bodies[0].requestId);
});
it("reports failed creation without accepting the draft", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({}, { status: 503 })),
	);
	const { result, input } = setup();
	await act(async () => {
		expect(await result.current.handleSendMessage("Feature request")).toBe(
			false,
		);
	});
	expect(input.setError).toHaveBeenCalled();
	expect(input.setActiveFeature).not.toHaveBeenCalled();
	expect(input.fetchAiQuestions).not.toHaveBeenCalled();
});

it("does not launch A after switching to B while A's message is saving", async () => {
	let finish: (() => void) | undefined;
	const persistMessage = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const { result, rerender, input } = setup({
		isCreatingNew: false,
		persistMessage,
	});
	let sent: Promise<boolean> | undefined;
	act(() => {
		sent = result.current.handleSendMessage("Original plan request");
	});
	rerender({ id: "b" });
	await act(async () => {
		finish?.();
		await sent;
	});
	expect(input.fetchAiQuestions).not.toHaveBeenCalled();
	expect(input.runRevision).not.toHaveBeenCalled();
});

it("preserves retry identity until a message is saved, then accepts repeated content as a new message", async () => {
	const persistMessage = vi
		.fn()
		.mockRejectedValueOnce(new Error("offline"))
		.mockResolvedValue(undefined);
	const { result, input } = setup({ isCreatingNew: false, persistMessage });
	await act(async () => {
		expect(await result.current.handleSendMessage("Same request")).toBe(false);
	});
	expect(input.fetchAiQuestions).not.toHaveBeenCalled();
	await act(async () => {
		expect(await result.current.handleSendMessage("Same request")).toBe(true);
	});
	await act(async () => {
		expect(await result.current.handleSendMessage("Same request")).toBe(true);
	});
	const calls = persistMessage.mock.calls;
	expect(calls[0][0].id).toBe(calls[1][0].id);
	expect(calls[2][0].id).not.toBe(calls[1][0].id);
});
