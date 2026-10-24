// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	dist2,
	distribute,
	mountOrb,
	nearest,
	VARIANTS,
	yawOf,
} from "../orb-core";

describe("Orb Core & Modules Contract", () => {
	it("exports complete variants matching supported agent states", () => {
		expect(VARIANTS).toHaveProperty("base");
		expect(VARIANTS).toHaveProperty("working");
		expect(VARIANTS).toHaveProperty("reasoning");
		expect(VARIANTS).toHaveProperty("searching");
		expect(VARIANTS).toHaveProperty("background");
		expect(VARIANTS).toHaveProperty("retrying");
		expect(VARIANTS).toHaveProperty("compacting");
		expect(VARIANTS).toHaveProperty("waiting");
	});

	it("distributes points uniformly for standard looks", () => {
		const count = 32;
		const points = distribute("base", count);
		expect(points).toHaveLength(count);
		for (const pt of points) {
			expect(pt).toHaveLength(3);
			const radius = Math.hypot(pt[0], pt[1], pt[2]);
			expect(radius).toBeCloseTo(1, 1);
		}
	});

	it("calculates nearest neighbors for reasoning walk graph", () => {
		const pts = [
			[0, 0, 0],
			[1, 0, 0],
			[0, 2, 0],
			[5, 0, 0],
		];
		const near = nearest(pts, 0, 2);
		expect(near).toEqual([1, 2]);
		expect(dist2(pts[0], pts[1])).toBe(1);
	});

	it("computes yaw rotation over time", () => {
		const yaw0 = yawOf("base", 0);
		const yawHalf = yawOf("base", 3250);
		expect(yaw0).toBe(0);
		expect(yawHalf).toBeCloseTo(Math.PI, 4);
	});

	it("mounts orb onto SVG element, supports lifecycle pause, play, destroy", () => {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		const orb = mountOrb(svg, {
			state: "working",
			variant: "gyro",
			size: 24,
			label: "Agent working",
		});

		expect(svg.getAttribute("width")).toBe("24");
		expect(svg.getAttribute("height")).toBe("24");
		expect(svg.getAttribute("role")).toBe("img");
		expect(svg.getAttribute("aria-label")).toBe("Agent working");
		expect(svg.querySelectorAll("circle").length).toBeGreaterThan(0);

		expect(typeof orb.pause).toBe("function");
		expect(typeof orb.play).toBe("function");
		expect(typeof orb.destroy).toBe("function");

		orb.pause();
		orb.play();
		orb.destroy();
	});
});
