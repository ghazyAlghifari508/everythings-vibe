// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceQuestions } from "../hooks/use-workspace-questions";
import type { CodebaseRunState } from "../services/chat-flow";

afterEach(() => vi.unstubAllGlobals());
it("ignores clarification results after leaving the requesting feature", async () => {
	let finish: (response: Response) => void = () => {};
	const pending = new Promise<Response>((resolve) => {
		finish = resolve;
	});
	vi.stubGlobal(
		"fetch",
		vi.fn((_url, init: RequestInit) => {
			return JSON.parse(String(init.body)).action
				? Promise.resolve(Response.json({}))
				: pending;
		}),
	);
	const { result, rerender } = renderHook(
		({ id }: { id: string | null }) => {
			const [run, setRun] = useState<CodebaseRunState | null>(null);
			return { ...useWorkspaceQuestions(id, setRun), run, setRun };
		},
		{ initialProps: { id: "a" as string | null } },
	);
	let request: Promise<void>;
	act(() => {
		request = result.current.fetchAiQuestions("a", "Feature request");
	});
	rerender({ id: null });
	act(() => result.current.setRun(null));
	await act(async () => {
		finish(
			Response.json({
				questions: [1, 2, 3].map((n) => ({
					id: `q${n}`,
					question: `Question ${n}`,
					type: "text",
				})),
			}),
		);
		await request;
	});
	expect(result.current.run).toBeNull();
	expect(result.current.aiQuestions).toEqual([]);
});
