// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	classifyWheelGesture,
	isScrollableOrEditableTarget,
	WHEEL_DISCRETE_NOTCH_THRESHOLD_PX,
} from "@/features/studio/utils/studio-canvas-gesture";

describe("classifyWheelGesture", () => {
	it("classifies trackpad pinch or Ctrl/Cmd wheel as zoom", () => {
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: 5.4,
				deltaMode: 0,
				ctrlKey: true,
			}),
		).toBe("zoom");

		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: -10,
				deltaMode: 0,
				metaKey: true,
			}),
		).toBe("zoom");
	});

	it("classifies physical mouse wheel with line or page deltaMode as zoom", () => {
		// Firefox and Windows line-based mouse wheel
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: 3,
				deltaMode: 1, // DOM_DELTA_LINE
			}),
		).toBe("zoom");

		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: -1,
				deltaMode: 2, // DOM_DELTA_PAGE
			}),
		).toBe("zoom");
	});

	it("classifies discrete integer wheel notch (deltaMode 0, deltaX 0, abs(deltaY) >= threshold) as zoom", () => {
		// Standard mouse wheel notch up (-100, -120) -> Zoom in
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: -100,
				deltaMode: 0,
			}),
		).toBe("zoom");

		// Standard mouse wheel notch down (100, 120) -> Zoom out
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: 120,
				deltaMode: 0,
			}),
		).toBe("zoom");

		// Exactly on the threshold
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: WHEEL_DISCRETE_NOTCH_THRESHOLD_PX,
				deltaMode: 0,
			}),
		).toBe("zoom");
	});

	it("classifies trackpad continuous scroll with fractional deltaY as pan", () => {
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: 2.5,
				deltaMode: 0,
			}),
		).toBe("pan");

		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: -14.28,
				deltaMode: 0,
			}),
		).toBe("pan");
	});

	it("classifies trackpad gesture with horizontal deltaX as pan", () => {
		// Pure horizontal scroll
		expect(
			classifyWheelGesture({
				deltaX: 25,
				deltaY: 0,
				deltaMode: 0,
			}),
		).toBe("pan");

		// Diagonal 2D trackpad gesture
		expect(
			classifyWheelGesture({
				deltaX: 5,
				deltaY: 100,
				deltaMode: 0,
			}),
		).toBe("pan");
	});

	it("falls back to pan for ambiguous small integer micro-steps", () => {
		// Trackpad slow vertical scrolling with integer values below threshold
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: 3,
				deltaMode: 0,
			}),
		).toBe("pan");

		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: -12,
				deltaMode: 0,
			}),
		).toBe("pan");
	});

	it("returns pan for zero delta", () => {
		expect(
			classifyWheelGesture({
				deltaX: 0,
				deltaY: 0,
				deltaMode: 0,
			}),
		).toBe("pan");
	});
});

describe("isScrollableOrEditableTarget", () => {
	it("detects textareas and input elements", () => {
		const textarea = document.createElement("textarea");
		document.body.appendChild(textarea);
		expect(isScrollableOrEditableTarget(textarea)).toBe(true);
		textarea.remove();

		const input = document.createElement("input");
		document.body.appendChild(input);
		expect(isScrollableOrEditableTarget(input)).toBe(true);
		input.remove();
	});

	it("detects dropdowns, menus, and dialogs by role", () => {
		const menu = document.createElement("div");
		menu.setAttribute("role", "menu");
		const menuItem = document.createElement("div");
		menuItem.setAttribute("role", "menuitem");
		menu.appendChild(menuItem);
		document.body.appendChild(menu);

		expect(isScrollableOrEditableTarget(menuItem)).toBe(true);
		menu.remove();
	});

	it("returns false for regular canvas elements", () => {
		const div = document.createElement("div");
		document.body.appendChild(div);
		expect(isScrollableOrEditableTarget(div)).toBe(false);
		div.remove();
	});

	it("detects scrollable containers with overflow auto or scroll", () => {
		const container = document.createElement("div");
		container.style.overflowY = "auto";
		Object.defineProperty(container, "scrollHeight", { value: 500 });
		Object.defineProperty(container, "clientHeight", { value: 200 });

		const child = document.createElement("p");
		container.appendChild(child);
		document.body.appendChild(container);

		expect(isScrollableOrEditableTarget(child, document.body)).toBe(true);
		container.remove();
	});
});
