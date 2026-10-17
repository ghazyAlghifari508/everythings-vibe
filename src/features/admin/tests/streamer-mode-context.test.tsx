// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	maskCurrency,
	maskEmail,
	maskName,
	maskOrderId,
	StreamerModeProvider,
	useStreamerMode,
} from "../components/streamer-mode-context";

describe("Streamer Mode Masking Utilities", () => {
	it("masks currency amounts correctly when active", () => {
		expect(maskCurrency(299700, true)).toBe("••••••••");
		expect(maskCurrency(0, true)).toBe("••••••••");
		expect(maskCurrency("299700", true)).toBe("••••••••");
		expect(maskCurrency(299700, false)).toContain("299.700");
	});

	it("masks order ids keeping prefix and last 2 digits", () => {
		expect(maskOrderId("INV-VQWTQW-123494", true)).toBe("INV-VQWTQW-•••94");
		expect(maskOrderId("INV-94", true)).toBe("INV-•••94");
		expect(maskOrderId("INV-VQWTQW-123494", false)).toBe("INV-VQWTQW-123494");
		expect(maskOrderId("INV12345", true)).toBe("IN•••45");
		expect(maskOrderId("", true)).toBe("");
	});

	it("masks user names keeping initial and ending letters", () => {
		expect(maskName("John Doe", true)).toBe("J • • • e");
		expect(maskName("Alice", true)).toBe("A • • • e");
		expect(maskName("Al", true)).toBe("A • • • l");
		expect(maskName("A", true)).toBe("A • • •");
		expect(maskName(null, true)).toBe("Anonymous");
		expect(maskName(undefined, true)).toBe("Anonymous");
		expect(maskName("John Doe", false)).toBe("John Doe");
		expect(maskName(null, false)).toBe("Anonymous");
	});

	it("masks user emails keeping domain structure anonymous", () => {
		expect(maskEmail("alghifari@gmail.com", true)).toBe("a••••@••••.com");
		expect(maskEmail("user@example.co.id", true)).toBe("u••••@••••.id");
		expect(maskEmail(null, true)).toBe("—");
		expect(maskEmail(undefined, true)).toBe("—");
		expect(maskEmail("alghifari@gmail.com", false)).toBe("alghifari@gmail.com");
		expect(maskEmail(null, false)).toBe("—");
	});
});

describe("StreamerModeProvider and useStreamerMode Hook", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;
	let currentContext: ReturnType<typeof useStreamerMode> | null = null;

	function TestConsumer() {
		currentContext = useStreamerMode();
		return null;
	}

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		currentContext = null;
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("defaults to false and toggles state correctly", () => {
		act(() => {
			root?.render(
				<StreamerModeProvider>
					<TestConsumer />
				</StreamerModeProvider>,
			);
		});

		expect(currentContext?.isStreamerMode).toBe(false);
		expect(currentContext?.maskName("John Doe")).toBe("John Doe");
		expect(currentContext?.maskCurrency(100000)).toContain("100.000");

		act(() => {
			currentContext?.toggleStreamerMode();
		});

		expect(currentContext?.isStreamerMode).toBe(true);
		expect(currentContext?.maskName("John Doe")).toBe("J • • • e");
		expect(currentContext?.maskCurrency(100000)).toBe("••••••••");
		expect(currentContext?.maskOrderId("INV-123456")).toBe("INV-•••56");

		act(() => {
			currentContext?.toggleStreamerMode();
		});

		expect(currentContext?.isStreamerMode).toBe(false);
		expect(currentContext?.maskName("John Doe")).toBe("John Doe");
		expect(currentContext?.maskCurrency(100000)).toContain("100.000");
	});

	it("preserves state across local storage reloads", () => {
		localStorage.setItem("prdfy_admin_streamer_mode", "true");

		act(() => {
			root?.render(
				<StreamerModeProvider>
					<TestConsumer />
				</StreamerModeProvider>,
			);
		});

		expect(currentContext?.isStreamerMode).toBe(true);
	});
});
