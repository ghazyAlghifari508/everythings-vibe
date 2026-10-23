// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceComposer } from "../hooks/use-workspace-composer";

function setup() {
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
		setChatMessages: vi.fn(),
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
	};
	return { input, ...renderHook(() => useWorkspaceComposer(input)) };
}
afterEach(() => vi.unstubAllGlobals());
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
