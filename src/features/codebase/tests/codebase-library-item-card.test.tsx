// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CodebaseLibraryItemCard,
	formatLibraryDate,
	formatLibraryMetadata,
	METADATA_SEPARATOR,
} from "@/features/codebase/components/planning/codebase-library-item-card";
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

describe("CodebaseLibraryItemCard status presentation", () => {
	it("does not render redundant 'Siap' for normal ready repositories", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-ready", "Portfolio App", {
					readiness: "planning_ready",
					hasReadyAnalysis: true,
					analysisAttemptStatus: "ready",
				})}
				selected={false}
				selectionActive={false}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		expect(screen.queryByText("Siap")).toBeNull();
		expect(screen.queryByText("Ready")).toBeNull();
		expect(screen.queryByText("Aktif")).toBeNull();
		expect(screen.getByText("Portfolio App")).toBeDefined();
	});

	it("preserves actionable status when attention or progress is needed", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		const actionableCases = [
			{
				readiness: "recovery_required" as const,
				analysisAttemptStatus: "failed" as const,
				expectedLabel: "Perlu analisis",
			},
			{
				readiness: "analysis_pending" as const,
				analysisAttemptStatus: "pending" as const,
				expectedLabel: "Menganalisis",
			},
			{
				readiness: "onboarding" as const,
				hasUsableSnapshot: false,
				expectedLabel: "Sinkronisasi belum selesai",
			},
		];

		for (const c of actionableCases) {
			const { unmount } = render(
				<CodebaseLibraryItemCard
					item={makeItem("cb-action", "Action Repo", {
						readiness: c.readiness,
						analysisAttemptStatus: c.analysisAttemptStatus,
						hasUsableSnapshot: c.hasUsableSnapshot,
					})}
					selected={false}
					selectionActive={false}
					onToggleSelect={onToggle}
					onRename={onRename}
					onDelete={onDelete}
				/>,
			);

			expect(screen.getByText(c.expectedLabel)).toBeDefined();
			expect(screen.queryByText("Siap")).toBeNull();
			unmount();
		}
	});
});

describe("CodebaseLibraryItemCard metadata formatting & microcopy", () => {
	it("uses pipe separator and Indonesian microcopy (rencana fitur, Diperbarui)", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-meta", "Ghazy Portofolio", {
					framework: "Astro",
					language: "TypeScript",
					packageManager: "npm",
					fileCount: 69,
					planCount: 2,
					snapshotCreatedAt: "2026-11-09T00:27:00.000Z",
				})}
				selected={false}
				selectionActive={false}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		const stackEl = screen.getByText("Astro | TypeScript | npm");
		expect(stackEl).toBeDefined();
		expect(stackEl.textContent).not.toContain("·");
		expect(stackEl.textContent).not.toContain("—");

		const metaEl = screen.getByText(/69 file \| 2 rencana fitur \| Diperbarui/);
		expect(metaEl).toBeDefined();
		expect(metaEl.textContent).not.toContain("fitur plan");
		expect(metaEl.textContent).not.toContain("Terakhir diperbarui");
		expect(metaEl.textContent).not.toContain("·");
		expect(metaEl.textContent).not.toContain("—");
	});

	it("omits separators cleanly when metadata parts are missing", () => {
		const onToggle = vi.fn();
		const onRename = vi.fn();
		const onDelete = vi.fn().mockResolvedValue(undefined);

		const { unmount } = render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-single-meta", "Single Meta Repo", {
					framework: null,
					language: null,
					packageManager: null,
					fileCount: 15,
					planCount: 0,
					snapshotCreatedAt: null,
					updatedAt: "",
				})}
				selected={false}
				selectionActive={false}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		const singleMeta = screen.getByText("15 file");
		expect(singleMeta.textContent).not.toContain("|");
		expect(singleMeta.textContent).not.toContain("·");
		unmount();

		render(
			<CodebaseLibraryItemCard
				item={makeItem("cb-no-meta", "No Meta Repo", {
					framework: null,
					language: null,
					packageManager: null,
					fileCount: null,
					planCount: 0,
					snapshotCreatedAt: null,
					updatedAt: "",
				})}
				selected={false}
				selectionActive={false}
				onToggleSelect={onToggle}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		expect(screen.queryByText(/file/)).toBeNull();
		expect(screen.queryByText(/rencana fitur/)).toBeNull();
		expect(screen.queryByText(/Diperbarui/)).toBeNull();
	});

	it("reflects dynamic counts and formats properly in formatLibraryMetadata unit helper", () => {
		const full = formatLibraryMetadata(
			{ fileCount: 42, planCount: 3 },
			"14 Okt 2026, 07.00",
		);
		expect(full).toEqual([
			"42 file",
			"3 rencana fitur",
			"Diperbarui 14 Okt 2026, 07.00",
		]);
		expect(full.join(METADATA_SEPARATOR)).toBe(
			"42 file | 3 rencana fitur | Diperbarui 14 Okt 2026, 07.00",
		);

		const zeroFiles = formatLibraryMetadata(
			{ fileCount: 0, planCount: 1 },
			null,
		);
		expect(zeroFiles).toEqual(["0 file", "1 rencana fitur"]);
		expect(zeroFiles.join(METADATA_SEPARATOR)).toBe("0 file | 1 rencana fitur");

		const zeroPlans = formatLibraryMetadata(
			{ fileCount: 10, planCount: 0 },
			null,
		);
		expect(zeroPlans).toEqual(["10 file"]);
		expect(zeroPlans.join(METADATA_SEPARATOR)).toBe("10 file");

		const empty = formatLibraryMetadata(
			{ fileCount: null, planCount: 0 },
			null,
		);
		expect(empty).toEqual([]);
		expect(empty.join(METADATA_SEPARATOR)).toBe("");
	});

	it("formats Indonesian dates cleanly with formatLibraryDate", () => {
		expect(formatLibraryDate(null)).toBeNull();
		expect(formatLibraryDate("")).toBeNull();
		expect(formatLibraryDate("invalid")).toBeNull();

		const formatted = formatLibraryDate("2026-11-09T00:27:00.000Z");
		expect(formatted).not.toBeNull();
		expect(formatted).toMatch(/9 Nov 2026/);
	});
});
