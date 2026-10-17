// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatDraft } from "@/features/greenfield/hooks/use-chat-draft";
import { getPrdDraft, savePrdDraft } from "@/lib/prompt-handoff";

describe("useChatDraft", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		window.sessionStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("initializes with empty string if no draft exists", () => {
		const { result } = renderHook(() => useChatDraft("proj-1"));
		expect(result.current.input).toBe("");
	});

	it("restores previously saved draft", () => {
		savePrdDraft("proj-1", "My draft idea");
		const { result } = renderHook(() => useChatDraft("proj-1"));
		expect(result.current.input).toBe("My draft idea");
	});

	it("ignores and clears template wrapper prompts", () => {
		savePrdDraft("proj-1", "[Platform: Web] Generate PRD lengkap...");
		const { result } = renderHook(() => useChatDraft("proj-1"));
		expect(result.current.input).toBe("");
	});

	it("auto-saves draft to storage after debounce", () => {
		const { result } = renderHook(() => useChatDraft("proj-2"));
		act(() => {
			result.current.setInput("Updated draft text");
		});

		expect(getPrdDraft("proj-2")).toBe("");

		act(() => {
			vi.advanceTimersByTime(350);
		});

		expect(getPrdDraft("proj-2")).toBe("Updated draft text");
	});

	it("clears draft and input on clearDraft()", () => {
		savePrdDraft("proj-3", "Temporary draft");
		const { result } = renderHook(() => useChatDraft("proj-3"));
		expect(result.current.input).toBe("Temporary draft");

		act(() => {
			result.current.clearDraft();
		});

		expect(result.current.input).toBe("");
		expect(getPrdDraft("proj-3")).toBe("");
	});
});
