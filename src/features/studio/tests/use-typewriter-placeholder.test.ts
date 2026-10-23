// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	STUDIO_PLACEHOLDERS,
	useTypewriterPlaceholder,
} from "../hooks/use-typewriter-placeholder";

describe("useTypewriterPlaceholder", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("animates web placeholder character by character when empty and not focused", () => {
		const { result } = renderHook(() =>
			useTypewriterPlaceholder({
				mode: "web",
				isEmpty: true,
				isFocused: false,
			}),
		);

		expect(result.current).toBe("");

		act(() => {
			vi.advanceTimersByTime(24 * 7);
		});

		expect(result.current).toBe(STUDIO_PLACEHOLDERS.web.slice(0, 7));

		act(() => {
			vi.advanceTimersByTime(24 * 200);
		});

		expect(result.current).toBe(STUDIO_PLACEHOLDERS.web);
	});

	it("restarts animation when switching mode from web to mobile", () => {
		let mode: "web" | "mobile" = "web";
		const { result, rerender } = renderHook(() =>
			useTypewriterPlaceholder({
				mode,
				isEmpty: true,
				isFocused: false,
			}),
		);

		act(() => {
			vi.advanceTimersByTime(24 * 200);
		});
		expect(result.current).toBe(STUDIO_PLACEHOLDERS.web);

		mode = "mobile";
		rerender();

		expect(result.current).toBe("");

		act(() => {
			vi.advanceTimersByTime(24 * 10);
		});
		expect(result.current).toBe(STUDIO_PLACEHOLDERS.mobile.slice(0, 10));

		act(() => {
			vi.advanceTimersByTime(24 * 200);
		});
		expect(result.current).toBe(STUDIO_PLACEHOLDERS.mobile);
	});

	it("immediately returns full text without animation if prefers-reduced-motion is active", () => {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: query.includes("prefers-reduced-motion"),
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		const { result } = renderHook(() =>
			useTypewriterPlaceholder({
				mode: "mobile",
				isEmpty: true,
				isFocused: false,
			}),
		);

		expect(result.current).toBe(STUDIO_PLACEHOLDERS.mobile);
	});

	it("stops animation and holds steady when focused", () => {
		const { result, rerender } = renderHook(
			({ isFocused }) =>
				useTypewriterPlaceholder({
					mode: "web",
					isEmpty: true,
					isFocused,
				}),
			{ initialProps: { isFocused: false } },
		);

		act(() => {
			vi.advanceTimersByTime(24 * 5);
		});
		const snapshot = result.current;
		expect(snapshot.length).toBe(5);

		// Focus the field
		rerender({ isFocused: true });

		act(() => {
			vi.advanceTimersByTime(24 * 50);
		});
		// Should not have advanced further while focused
		expect(result.current).toBe(snapshot);
	});

	it("returns full placeholder when input is not empty", () => {
		const { result } = renderHook(() =>
			useTypewriterPlaceholder({
				mode: "web",
				isEmpty: false,
				isFocused: false,
			}),
		);

		expect(result.current).toBe(STUDIO_PLACEHOLDERS.web);
	});
});
