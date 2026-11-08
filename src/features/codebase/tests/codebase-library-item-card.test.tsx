// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseLibraryItemCard } from "@/features/codebase/components/planning/codebase-library-item-card";
import {
	installRadixDomPolyfills,
	makeItem,
} from "@/features/codebase/tests/codebase-library-selection-fixture";

vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		children: React.ReactNode;
		to: string;
		params?: { id: string };
		className?: string;
		onClick?: () => void;
	}) => (
		<a
			href={props.params ? props.to.replace("$id", props.params.id) : props.to}
			className={props.className}
			onClick={props.onClick}
		>
			{props.children}
		</a>
	),
}));

beforeEach(() => {
	installRadixDomPolyfills();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("CodebaseLibraryItemCard selection layout & vertical alignment", () => {
	it("renders selection checkbox with items-center, self-stretch, and no pt-5", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-1", "Ocean Guard")}
				selected={false}
				selectionActive={true}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		const checkbox = screen.getByRole("checkbox", {
			name: /Pilih repository Ocean Guard/i,
		});
		const label = checkbox.closest("label");
		const cardItem = checkbox.closest("li");

		expect(label).not.toBeNull();
		expect(cardItem).not.toBeNull();

		// Parent row must stretch children vertically
		expect(cardItem?.className).toContain("flex");
		expect(cardItem?.className).toContain("items-stretch");
		expect(cardItem?.className).not.toContain("items-start");

		// Checkbox wrapper must vertically center its child and stretch to card height
		expect(label?.className).toContain("flex");
		expect(label?.className).toContain("items-center");
		expect(label?.className).toContain("self-stretch");
		expect(label?.className).toContain("pl-4");

		// No arbitrary pt-5 positioning or translateY hacks
		expect(label?.className).not.toContain("pt-5");
		expect(label?.className).not.toContain("items-start");
		expect(label?.className).not.toContain("translate");
	});

	it("keeps checkbox focusable with visible focus ring styling", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-focus", "Focus Test Repo")}
				selected={false}
				selectionActive={true}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		const checkbox = screen.getByRole("checkbox", {
			name: /Pilih repository Focus Test Repo/i,
		});

		expect(checkbox.className).toContain("size-4");
		expect(checkbox.className).toContain("focus-visible:ring-2");
		expect(checkbox.className).toContain("focus-visible:ring-indigo");

		checkbox.focus();
		expect(document.activeElement).toBe(checkbox);
	});

	it("toggles the correct item when clicking the checkbox and when clicking the card body", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-target", "Target Repo")}
				selected={false}
				selectionActive={true}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		const checkbox = screen.getByRole("checkbox", {
			name: /Pilih repository Target Repo/i,
		});
		fireEvent.click(checkbox);
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onToggle).toHaveBeenLastCalledWith("cb-target");

		const cardButton = screen.getByRole("button", {
			name: /Target Repo/i,
		});
		fireEvent.click(cardButton);
		expect(onToggle).toHaveBeenCalledTimes(2);
		expect(onToggle).toHaveBeenLastCalledWith("cb-target");
	});

	it("maintains stable vertical centering layout across varied content lengths and statuses", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		const scenarios = [
			{
				name: "A",
				summary: null,
				statusKey: "ready",
				readiness: "planning_ready" as const,
			},
			{
				name: "Very Long Repository Name That Wraps Multiple Lines And Has Extended Identifiers In Production",
				summary:
					"Detailed multi-line summary explaining that this repository contains comprehensive architectural plans, migrations, services, and domain components designed for extreme scale.",
				statusKey: "needs_analysis",
				readiness: "recovery_required" as const,
			},
			{
				name: "Standard Repo",
				summary: "Single line summary.",
				statusKey: "uploaded",
				readiness: "recovery_required" as const,
			},
		];

		for (const scenario of scenarios) {
			const { unmount } = render(
				<CodebaseLibraryItemCard
					item={makeItem(`cb-${scenario.name}`, scenario.name, {
						summary: scenario.summary,
						readiness: scenario.readiness,
					})}
					selected={true}
					selectionActive={true}
					onToggleSelect={onToggle}
					onRename={onRename}
					onDelete={onDelete}
				/>,
			);

			const checkbox = screen.getByRole("checkbox", {
				name: new RegExp(`Pilih repository ${scenario.name.slice(0, 20)}`, "i"),
			});
			const label = checkbox.closest("label");
			const cardItem = checkbox.closest("li");

			expect(cardItem?.className).toContain("items-stretch");
			expect(label?.className).toContain("items-center");
			expect(label?.className).toContain("self-stretch");
			expect(label?.className).not.toContain("pt-5");

			unmount();
		}
	});

	it("preserves normal mode without checkbox or selection artifacts", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-normal", "Normal Mode Repo")}
				selected={false}
				selectionActive={false}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
		expect(
			screen.getByRole("link", { name: /Normal Mode Repo/i }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Opsi repository Normal Mode Repo/i }),
		).toBeDefined();
	});
});
