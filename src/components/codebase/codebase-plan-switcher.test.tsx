// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivePlanCandidate } from "@/features/codebase/services/active-plan";
import { CodebasePlanSwitcher } from "./codebase-plan-switcher";

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
