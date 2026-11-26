// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlowStepNav } from "@/components/layout/flow-step-nav";
import { useChatStore } from "@/store";

vi.mock("@tanstack/react-router", () => ({
	useLocation: ({
		select,
	}: {
		select: (location: { pathname: string }) => unknown;
	}) => select({ pathname: "/vibeplan/project-a/prd" }),
}));
afterEach(() => {
	cleanup();
	useChatStore.getState().resetChat();
});

it("marks the viewed stage active without inventing completion from the legacy step or another project's task state", () => {
	useChatStore.getState().setTaskGenerated(true);
	render(
		<FlowStepNav
			step="task"
			taskStatus="completed"
			availability={{
				projectId: "project-a",
				step: "prd",
				lastUrl: null,
				hasFeatures: true,
				hasPrd: false,
				hasAc: false,
				hasTasks: false,
				hasHandoff: true,
				featuresStatus: "completed",
			}}
		/>,
	);
	const items = within(
		screen.getByRole("list", { name: "Progress alur proyek" }),
	).getAllByRole("listitem");
	expect(items[2].getAttribute("aria-current")).toBe("step");
	for (const index of [0, 1])
		expect(within(items[index]).getByText("(Selesai)")).toBeTruthy();
	for (const index of [2, 3, 4, 5])
		expect(within(items[index]).queryByText("(Selesai)")).toBeNull();
});
