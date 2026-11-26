// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	isCanvasControlTarget,
	isScrollableOrEditableTarget,
	normalizeWheelPanDelta,
} from "@/features/studio/utils/studio-canvas-gesture";
import { WHEEL_LINE_HEIGHT_PX } from "@/lib/constants";

const page = { clientWidth: 1024, clientHeight: 700 };
const normalize = (input: Parameters<typeof normalizeWheelPanDelta>[0]) =>
	normalizeWheelPanDelta(input, page);

describe("normalizeWheelPanDelta", () => {
	it("normalizes a large integer notch into pan pixels without zoom", () => {
		expect(normalize({ deltaX: 0, deltaY: -120, deltaMode: 0 })).toEqual({
			x: 0,
			y: -120,
		});
		expect(normalize({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toEqual({
			x: 0,
			y: 100,
		});
	});

	it("keeps fractional trackpad deltas", () => {
		expect(normalize({ deltaX: 0, deltaY: -14.28, deltaMode: 0 })).toEqual({
			x: 0,
			y: -14.28,
		});
	});

	it("respects horizontal and diagonal scroll", () => {
		expect(normalize({ deltaX: 25, deltaY: 0, deltaMode: 0 })).toEqual({
			x: 25,
			y: 0,
		});
		expect(normalize({ deltaX: 5, deltaY: 100, deltaMode: 0 })).toEqual({
			x: 5,
			y: 100,
		});
	});

	it("normalizes line and page delta modes on both axes", () => {
		expect(normalize({ deltaX: 3, deltaY: -2, deltaMode: 1 })).toEqual({
			x: 3 * WHEEL_LINE_HEIGHT_PX,
			y: -2 * WHEEL_LINE_HEIGHT_PX,
		});
		expect(normalize({ deltaX: 1, deltaY: -1, deltaMode: 2 })).toEqual({
			x: page.clientWidth,
			y: -page.clientHeight,
		});
	});

	it("maps non-finite and zero deltas to no pan", () => {
		expect(
			normalize({
				deltaX: Number.NaN,
				deltaY: Number.POSITIVE_INFINITY,
				deltaMode: 0,
			}),
		).toEqual({ x: 0, y: 0 });
		expect(normalize({ deltaX: 0, deltaY: 0, deltaMode: 0 })).toEqual({
			x: 0,
			y: 0,
		});
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

	it("treats a marked frame surface as canvas background, not as a button", () => {
		const article = document.createElement("article");
		const select = document.createElement("button");
		select.setAttribute("data-canvas-gesture-surface", "");
		const label = document.createElement("span");
		select.appendChild(label);
		article.appendChild(select);
		document.body.appendChild(article);

		expect(select.getAttribute("data-canvas-gesture-surface")).not.toBeNull();
		// The wheel over a frame artboard belongs to the canvas.
		expect(isScrollableOrEditableTarget(select, document.body)).toBe(false);
		expect(isScrollableOrEditableTarget(label, document.body)).toBe(false);

		// A real control is still left alone.
		const control = document.createElement("button");
		article.appendChild(control);
		expect(isScrollableOrEditableTarget(control, document.body)).toBe(true);

		article.remove();
	});

	it("lets a hand drag start on a frame surface but not on a real control", () => {
		const canvas = document.createElement("section");
		const frameSurface = document.createElement("button");
		frameSurface.setAttribute("data-canvas-gesture-surface", "");
		canvas.appendChild(frameSurface);

		const zoomButton = document.createElement("button");
		canvas.appendChild(zoomButton);
		const overlay = document.createElement("div");
		overlay.setAttribute("data-canvas-marquee-ignore", "");
		canvas.appendChild(overlay);
		document.body.appendChild(canvas);

		expect(isCanvasControlTarget(frameSurface)).toBe(false);
		expect(isCanvasControlTarget(zoomButton)).toBe(true);
		expect(isCanvasControlTarget(overlay)).toBe(true);
		expect(isCanvasControlTarget(canvas)).toBe(false);
		expect(isCanvasControlTarget(null)).toBe(false);

		canvas.remove();
	});
});
