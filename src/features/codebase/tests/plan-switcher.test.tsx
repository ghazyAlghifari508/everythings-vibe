// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivePlanCandidate } from "@/features/codebase/services/active-plan";
import { CodebasePlanSwitcher } from "../components/planning/codebase-plan-switcher";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
});

const readyPlan: ActivePlanCandidate = {
	id: "plan-ready",
	name: "Filter Artikel",
	updatedAt: "2026-01-01T00:00:00.000Z",
	hasArtifacts: true,
	hasFeature: true,
	hasPrd: true,
	hasAc: true,
	hasTasks: true,
};

const draftPlan: ActivePlanCandidate = {
	id: "plan-draft",
	name: "Preferensi Minat",
	updatedAt: "2026-02-01T00:00:00.000Z",
	hasArtifacts: false,
};

function renderSwitcher(
	props: Partial<Parameters<typeof CodebasePlanSwitcher>[0]> = {},
) {
	const onSelectPlan = vi.fn();
	const onCreateFeature = vi.fn();
	act(() => {
		root?.render(
			<CodebasePlanSwitcher
				plans={[readyPlan, draftPlan]}
				activePlanId={readyPlan.id}
				activePlanName={readyPlan.name}
				onSelectPlan={onSelectPlan}
				onCreateFeature={onCreateFeature}
				{...props}
			/>,
		);
	});
	return { onSelectPlan, onCreateFeature };
}

function openMenu() {
	const trigger = container.querySelector<HTMLElement>(
		"[data-testid='codebase-plan-switcher']",
	);
	act(() => {
		trigger?.focus();
		trigger?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
		);
		trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

describe("CodebasePlanSwitcher trigger", () => {
	it("shows the active plan name instead of mixed internal counts", () => {
		renderSwitcher();
		const trigger = container.querySelector(
			"[data-testid='codebase-plan-switcher']",
		);
		expect(trigger?.textContent).toContain("Filter Artikel");
		expect(trigger?.textContent).not.toContain("Berisi");
		expect(trigger?.textContent).not.toMatch(/\d+ fitur/);
	});
});

describe("CodebasePlanSwitcher menu", () => {
	it("lists ready plans with their real artifact breakdown", () => {
		renderSwitcher();
		openMenu();
		const option = document.body.querySelector(
			"[data-testid='codebase-plan-option-plan-ready']",
		);
		expect(option?.textContent).toContain("Filter Artikel");
		expect(option?.textContent).toContain("PRD");
		expect(option?.textContent).toContain("AC");
		expect(option?.textContent).toContain("Task");
	});

	it("lists artifact-less drafts as resumable instead of hiding them", () => {
		renderSwitcher();
		openMenu();
		const option = document.body.querySelector(
			"[data-testid='codebase-plan-option-plan-draft']",
		);
		expect(option?.textContent).toContain("Preferensi Minat");
		expect(option?.textContent).toContain("Draft");
	});

	it("marks the active plan and selects another plan on click", () => {
		const { onSelectPlan } = renderSwitcher();
		openMenu();
		const active = document.body.querySelector(
			"[data-testid='codebase-plan-option-plan-ready']",
		);
		expect(active?.getAttribute("aria-current")).toBe("true");
		const draft = document.body.querySelector<HTMLElement>(
			"[data-testid='codebase-plan-option-plan-draft']",
		);
		act(() => {
			draft?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSelectPlan).toHaveBeenCalledWith("plan-draft");
	});

	it("offers one explicit create-new action that does not select a plan", () => {
		const { onSelectPlan, onCreateFeature } = renderSwitcher();
		openMenu();
		const create = document.body.querySelector<HTMLElement>(
			"[data-testid='codebase-plan-create-new']",
		);
		expect(create?.textContent).toContain("Buat fitur baru");
		act(() => {
			create?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onCreateFeature).toHaveBeenCalledTimes(1);
		expect(onSelectPlan).not.toHaveBeenCalled();
	});
});

describe("CodebasePlanSwitcher search", () => {
	function typeQuery(value: string) {
		const input = document.body.querySelector<HTMLInputElement>(
			"[data-testid='codebase-plan-search']",
		);
		act(() => {
			input?.dispatchEvent(
				new Event("input", { bubbles: true }),
			);
			if (input) {
				const setter = Object.getOwnPropertyDescriptor(
					window.HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(input, value);
				input.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
	}

	it("filters the list to plans matching the query", () => {
		renderSwitcher();
		openMenu();
		typeQuery("Filter");
		const ready = document.body.querySelector(
			"[data-testid='codebase-plan-option-plan-ready']",
		);
		const draft = document.body.querySelector(
			"[data-testid='codebase-plan-option-plan-draft']",
		);
		expect(ready).not.toBeNull();
		expect(draft).toBeNull();
	});

	it("shows a no-results message when nothing matches", () => {
		renderSwitcher();
		openMenu();
		typeQuery("tidak-ada-fitur-ini");
		const empty = document.body.querySelector(
			"[data-testid='codebase-plan-empty']",
		);
		expect(empty?.textContent).toContain("Tidak ada fitur yang cocok");
		expect(
			document.body.querySelector("[data-testid='codebase-plan-option-plan-ready']"),
		).toBeNull();
	});

	it("keeps the create-new action reachable while searching", () => {
		renderSwitcher();
		openMenu();
		typeQuery("Filter");
		expect(
			document.body.querySelector("[data-testid='codebase-plan-create-new']"),
		).not.toBeNull();
	});
});

describe("CodebasePlanSwitcher large list", () => {
	it("renders every plan inside the bounded scroll region", () => {
		const many: ActivePlanCandidate[] = Array.from({ length: 30 }, (_, i) => ({
			...draftPlan,
			id: `plan-${i}`,
			name: `Fitur ${i}`,
		}));
		renderSwitcher({ plans: many, activePlanId: null, activePlanName: null });
		openMenu();
		const list = document.body.querySelector(
			"[data-testid='codebase-plan-list']",
		);
		// The scroll region hosts all 30 plans; max-h + overflow-y keeps it
		// bounded rather than pushing the create action off-screen.
		expect(list?.querySelectorAll("[data-testid^='codebase-plan-option-']"))
			.toHaveLength(30);
		const create = document.body.querySelector(
			"[data-testid='codebase-plan-create-new']",
		);
		expect(create).not.toBeNull();
	});
});

describe("describePlanMeta task progress", () => {
	it("leads with task progress when the plan carries tasks", () => {
		renderSwitcher({
			plans: [
				{
					...readyPlan,
					taskTotal: 12,
					taskCompleted: 4,
				},
			],
		});
		openMenu();
		const option = document.body.querySelector(
			"[data-testid='codebase-plan-option-plan-ready']",
		);
		expect(option?.textContent).toContain("12 task");
		expect(option?.textContent).toContain("4 selesai");
	});
});
