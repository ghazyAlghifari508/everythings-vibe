import { describe, expect, it } from "vitest";
import {
	type FlowStep,
	getFlowStepCta,
	routeToStep,
	stepToRoute,
} from "@/features/greenfield/utils/flow-step";

describe("stepToRoute", () => {
	it("maps question step to /ask route", () => {
		expect(stepToRoute("question", "p1")).toBe("/vibeplan/p1/ask");
	});

	it("maps prd step to /prd route", () => {
		expect(stepToRoute("prd", "p1")).toBe("/vibeplan/p1/prd");
	});

	it("maps fitur step to /fitur route", () => {
		expect(stepToRoute("fitur", "p1")).toBe("/vibeplan/p1/fitur");
	});

	it("maps ac step to /ac route", () => {
		expect(stepToRoute("ac", "p1")).toBe("/vibeplan/p1/ac");
	});

	it("maps task step to /task route", () => {
		expect(stepToRoute("task", "p1")).toBe("/vibeplan/p1/task");
	});

	it("defaults unknown/null step to /prd route", () => {
		// ponytail: defensive - DB step could be null/legacy. /prd is the landing.
		expect(stepToRoute(undefined, "p1")).toBe("/vibeplan/p1/prd");
		expect(stepToRoute(null, "p1")).toBe("/vibeplan/p1/prd");
		expect(stepToRoute("unknown", "p1")).toBe("/vibeplan/p1/prd");
	});

	it("encodes reserved characters in the project id segment", () => {
		expect(stepToRoute("task", "a/b?c#d%e")).toBe(
			"/vibeplan/a%2Fb%3Fc%23d%25e/task",
		);
		expect(stepToRoute("prd", "p1")).toBe("/vibeplan/p1/prd");
	});
});

describe("routeToStep", () => {
	it("detects ask as question", () => {
		expect(routeToStep("/vibeplan/x/ask")).toBe("question");
		expect(routeToStep("/ask")).toBe("question");
	});

	it("detects ac", () => {
		expect(routeToStep("/vibeplan/x/ac")).toBe("ac");
	});

	it("detects fitur", () => {
		expect(routeToStep("/vibeplan/x/fitur")).toBe("fitur");
		expect(routeToStep("/fitur")).toBe("fitur");
	});

	it("detects task and kanban as task", () => {
		expect(routeToStep("/vibeplan/x/task")).toBe("task");
		expect(routeToStep("/kanban/x")).toBe("task");
	});

	it("defaults to prd", () => {
		expect(routeToStep("/")).toBe("prd");
		expect(routeToStep("/pricing")).toBe("prd");
	});
});

describe("round-trip", () => {
	it("stepToRoute is the inverse of routeToStep for every flow step", () => {
		const routes = [
			"/vibeplan/x/ask",
			"/vibeplan/x/fitur",
			"/vibeplan/x/prd",
			"/vibeplan/x/ac",
			"/vibeplan/x/task",
		];
		for (const r of routes) {
			expect(stepToRoute(routeToStep(r), "x")).toBe(r);
		}
	});

	it("FlowStep covers exactly question|fitur|prd|ac|task", () => {
		const steps: FlowStep[] = ["question", "fitur", "prd", "ac", "task"];
		expect(steps).toHaveLength(5);
	});
});

describe("getFlowStepCta", () => {
	it("returns Lihat Fitur on question route when the tree is not generated yet", () => {
		const cta = getFlowStepCta("question", "question", false);
		expect(cta).toEqual({
			kind: "generate",
			label: "Lihat Fitur",
			targetStep: "fitur",
		});
	});

	it("returns Lihat Fitur navigate on question route when the tree exists", () => {
		const cta = getFlowStepCta("question", "fitur", false);
		expect(cta).toEqual({
			kind: "navigate",
			label: "Lihat Fitur",
			targetStep: "fitur",
		});
	});

	it("returns Kembali ke PRD on question route when project already has PRD", () => {
		const cta = getFlowStepCta("question", "prd", true);
		expect(cta).toEqual({
			kind: "navigate",
			label: "Kembali ke PRD",
			targetStep: "prd",
		});
	});

	it("returns Kembali ke AC on question route when project has reached AC stage", () => {
		const cta = getFlowStepCta("question", "ac", true);
		expect(cta).toEqual({
			kind: "navigate",
			label: "Kembali ke AC",
			targetStep: "ac",
		});
	});

	it("returns Kembali ke Task on question route when project has reached Task stage", () => {
		const cta = getFlowStepCta("question", "task", true);
		expect(cta).toEqual({
			kind: "navigate",
			label: "Kembali ke Task",
			targetStep: "task",
		});
	});

	it("returns null for task route", () => {
		expect(getFlowStepCta("task", "task")).toBeNull();
	});
});
