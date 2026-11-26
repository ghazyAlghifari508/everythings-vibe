// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlowStepNav } from "@/components/layout/flow-step-nav";
import { useChatStore } from "@/store";
import type { WorkspaceAvailability } from "../utils/workspace-routing";

const route = vi.hoisted(() => ({ pathname: "/vibeplan/project-a/prd" }));
vi.mock("@tanstack/react-router", () => ({
	useLocation: ({
		select,
	}: {
		select: (location: { pathname: string }) => unknown;
	}) => select({ pathname: route.pathname }),
}));
afterEach(() => {
	cleanup();
	route.pathname = "/vibeplan/project-a/prd";
	useChatStore.getState().resetChat();
});

const availability = (
	patch: Partial<WorkspaceAvailability> = {},
): WorkspaceAvailability => ({
	projectId: "project-a",
	step: "prd",
	lastUrl: null,
	hasFeatures: true,
	hasPrd: false,
	hasAc: false,
	hasTasks: false,
	hasHandoff: true,
	featuresStatus: "completed",
	...patch,
});

const renderItems = (
	props: Parameters<typeof FlowStepNav>[0] = {},
): HTMLElement[] => {
	render(<FlowStepNav {...props} />);
	return within(
		screen.getByRole("list", { name: "Progress alur proyek" }),
	).getAllByRole("listitem");
};

it("marks the viewed stage active without inventing completion from the legacy step or another project's task state", () => {
	useChatStore.getState().setTaskGenerated(true);
	const items = renderItems({
		step: "task",
		taskStatus: "completed",
		availability: availability(),
	});
	expect(items[2].getAttribute("aria-current")).toBe("step");
	for (const index of [0, 1])
		expect(within(items[index]).getByText("(Selesai)")).toBeTruthy();
	for (const index of [2, 3, 4])
		expect(within(items[index]).queryByText("(Selesai)")).toBeNull();
});

it("renders exactly five stages and no Kanban stage", () => {
	const items = renderItems({ availability: availability() });
	expect(items.map((item) => item.textContent?.replace(/\(.*\)/, ""))).toEqual([
		expect.stringContaining("Ask"),
		expect.stringContaining("Fitur"),
		expect.stringContaining("PRD"),
		expect.stringContaining("AC"),
		expect.stringContaining("Task"),
	]);
	expect(screen.queryByText(/kanban/i)).toBeNull();
});

it("maps the kanban view onto the Task stage and keeps completion tied to real artifacts", () => {
	route.pathname = "/vibeplan/project-a/kanban";
	const items = renderItems({
		availability: availability({
			step: "task",
			hasPrd: true,
			hasAc: true,
			hasTasks: false,
		}),
	});
	expect(items.map((i) => i.getAttribute("aria-current"))).toEqual([
		null,
		null,
		null,
		null,
		"step",
	]);
	expect(within(items[4]).queryByText("(Selesai)")).toBeNull();
	expect(within(items[3]).getByText("(Selesai)")).toBeTruthy();
});

it("exposes status without colour: sr-only text and no green token", () => {
	const items = renderItems({
		availability: availability({ hasPrd: true, hasAc: true }),
	});
	expect(within(items[0]).getByText("(Selesai)")).toBeTruthy();
	expect(within(items[2]).getByText("(Tahap saat ini)")).toBeTruthy();
	expect(document.querySelector("ol")?.innerHTML.includes("emerald")).toBe(
		false,
	);
});
