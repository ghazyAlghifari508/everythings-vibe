// @vitest-environment jsdom
import { act, cleanup } from "@testing-library/react";
import { useEffect } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivePlanCandidate } from "@/features/codebase/services/active-plan";
import { CodebasePlanSwitcher } from "../components/planning/codebase-plan-switcher";
import { useWorkspacePlan } from "../hooks/use-workspace-plan";
import {
	readActivePlanPointer,
	storeActivePlanPointer,
} from "../services/plan-storage";

type WorkspaceData = Parameters<typeof useWorkspacePlan>[0];

const KARYA = "Demi Kemudahan Eksplorasi Karya";
const KATALOG = "Katalog Resep Nusantara";
const CI = "Pipeline Integrasi Berkelanjutan";
const BLOG = "Blog Artikel Teknis";

function plan(
	id: string,
	name: string,
	hasArtifacts: boolean,
): ActivePlanCandidate {
	return {
		id,
		name,
		updatedAt: "2026-01-01T00:00:00.000Z",
		hasArtifacts,
		hasFeature: hasArtifacts,
		hasPrd: hasArtifacts,
		hasAc: hasArtifacts,
		hasTasks: hasArtifacts,
	};
}

function repoA(): WorkspaceData {
	return {
		codebase: {
			id: "repo-a",
			name: "Ghazy Portofolio",
			onboardingProjectId: null,
			repositoryIdentity: null,
		},
		// plan-karya is the only plan carrying artifacts, so the server resolves
		// it deterministically; plan-katalog exists only to hold a browser
		// preference that differs from that resolution.
		plans: [
			plan("plan-karya", KARYA, true),
			plan("plan-katalog", KATALOG, false),
		],
		onboardingFeatureId: null,
	};
}

function repoB(): WorkspaceData {
	return {
		codebase: {
			id: "repo-b",
			name: "Repo B",
			onboardingProjectId: null,
			repositoryIdentity: null,
		},
		plans: [plan("plan-ci", CI, true), plan("plan-blog", BLOG, false)],
		onboardingFeatureId: null,
	};
}

interface PlanApi {
	current: ReturnType<typeof useWorkspacePlan> | null;
}

function PlanHarness({ data, api }: { data: WorkspaceData; api?: PlanApi }) {
	const planState = useWorkspacePlan(data);
	useEffect(() => {
		if (api) api.current = planState;
	});
	return (
		<CodebasePlanSwitcher
			plans={planState.userFacingPlans}
			activePlanId={planState.effectiveFeatureId}
			activePlanName={planState.resolvedFeature?.name ?? null}
			onSelectPlan={planState.setRequestedProjectId}
			onCreateFeature={() => planState.setIsCreatingNew(true)}
		/>
	);
}

/**
 * Server markup: `sessionStorage` is stubbed away the way a real server has
 * no browser storage, so this is the render the SSR pass actually emits.
 */
function renderServerMarkup(data: WorkspaceData): string {
	vi.stubGlobal("sessionStorage", undefined);
	try {
		return renderToString(<PlanHarness data={data} />);
	} finally {
		vi.unstubAllGlobals();
	}
}

interface HydrationResult {
	recoverable: unknown[];
	consoleErrors: unknown[][];
	root: Root;
	container: HTMLDivElement;
}

function hydrateMarkup(
	markup: string,
	data: WorkspaceData,
	api?: PlanApi,
): HydrationResult {
	const recoverable: unknown[] = [];
	const consoleErrors: unknown[][] = [];
	const mismatch = /hydrat|did not match|didn't match/i;
	const originalError = console.error;
	vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
		if (args.some((arg) => mismatch.test(String(arg))))
			consoleErrors.push(args);
		else originalError(...args);
	});
	const container = document.createElement("div");
	container.innerHTML = markup;
	document.body.appendChild(container);
	let root!: Root;
	act(() => {
		root = hydrateRoot(container, <PlanHarness data={data} api={api} />, {
			onRecoverableError: (error) => {
				recoverable.push(error);
			},
		});
	});
	return { recoverable, consoleErrors, root, container };
}

function triggerText(container: ParentNode): string {
	return (
		container.querySelector("[data-testid='codebase-plan-switcher']")
			?.textContent ?? ""
	);
}

function openMenu(container: ParentNode): HTMLElement | null {
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
	return trigger;
}

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function hydrateFresh(data: WorkspaceData, api?: PlanApi): HydrationResult {
	const markup = renderServerMarkup(data);
	const result = hydrateMarkup(markup, data, api);
	mounted.push({ root: result.root, container: result.container });
	return result;
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	sessionStorage.clear();
});

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		act(() => entry.root.unmount());
		entry.container.remove();
	}
	cleanup();
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	sessionStorage.clear();
});

describe("server render and first client render agree on the active plan", () => {
	it("emits the deterministic plan on the server even when a browser pointer exists elsewhere", () => {
		// The pointer lives in browser storage only; the server resolves from
		// loader data, so the markup must name the plan that wins without it.
		storeActivePlanPointer("repo-a", "plan-katalog");
		const markup = renderServerMarkup(repoA());
		expect(markup).toContain(KARYA);
		expect(markup).not.toContain(KATALOG);
	});

	it("hydrates without a mismatch while a different plan is stored, then restores it", () => {
		storeActivePlanPointer("repo-a", "plan-katalog");
		const { recoverable, consoleErrors, root, container } = hydrateFresh(
			repoA(),
		);
		expect(recoverable).toEqual([]);
		expect(consoleErrors).toEqual([]);
		// First client render matched the server (no recoverable error above);
		// the stored preference is applied only after hydration.
		expect(triggerText(container)).toContain(KATALOG);
		expect(triggerText(container)).not.toContain(KARYA);
		expect(readActivePlanPointer("repo-a")).toBe("plan-katalog");
		act(() => root.render(<PlanHarness data={repoA()} />));
		expect(triggerText(container)).toContain(KATALOG);
	});

	it("keeps the deterministic plan when storage is empty and records it afterwards", () => {
		const { recoverable, consoleErrors, container } = hydrateFresh(repoA());
		expect(recoverable).toEqual([]);
		expect(consoleErrors).toEqual([]);
		expect(triggerText(container)).toContain(KARYA);
		expect(readActivePlanPointer("repo-a")).toBe("plan-karya");
	});
});

describe("stale pointers are dropped instead of forced active", () => {
	it("falls back to the valid plan and rewrites storage with it", () => {
		storeActivePlanPointer("repo-a", "plan-deleted");
		const { recoverable, container } = hydrateFresh(repoA());
		expect(recoverable).toEqual([]);
		expect(triggerText(container)).toContain(KARYA);
		expect(triggerText(container)).not.toContain(KATALOG);
		expect(readActivePlanPointer("repo-a")).toBe("plan-karya");
	});

	it("ignores a pointer that names another repository's plan", () => {
		storeActivePlanPointer("repo-a", "plan-blog");
		const { recoverable, container } = hydrateFresh(repoA());
		expect(recoverable).toEqual([]);
		expect(triggerText(container)).toContain(KARYA);
		expect(readActivePlanPointer("repo-a")).toBe("plan-karya");
	});
});

describe("plan selection, refresh and dropdown labels", () => {
	it("restores a selected plan after a refresh without a hydration mismatch", () => {
		const first = hydrateFresh(repoA());
		openMenu(first.container);
		const option = document.body.querySelector<HTMLElement>(
			"[data-testid='codebase-plan-option-plan-katalog']",
		);
		act(() => {
			option?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(triggerText(first.container)).toContain(KATALOG);
		expect(readActivePlanPointer("repo-a")).toBe("plan-katalog");

		act(() => first.root.unmount());
		first.container.remove();
		mounted.length = 0;

		// Refresh: the server again renders without storage, so markup and the
		// first client render still agree; the pointer lands after hydration.
		const second = hydrateFresh(repoA());
		expect(second.recoverable).toEqual([]);
		expect(second.consoleErrors).toEqual([]);
		expect(triggerText(second.container)).toContain(KATALOG);
	});

	it("lists every user-facing plan and keeps the trigger label identical to the active plan", () => {
		const { container } = hydrateFresh(repoA());
		const trigger = openMenu(container);
		expect(trigger?.textContent).toContain(KARYA);
		const options = document.body.querySelectorAll(
			"[data-testid^='codebase-plan-option-']",
		);
		expect(
			Array.from(options).map((option) => option.getAttribute("data-testid")),
		).toEqual([
			"codebase-plan-option-plan-karya",
			"codebase-plan-option-plan-katalog",
		]);
		expect(
			document.body
				.querySelector("[data-testid='codebase-plan-option-plan-karya']")
				?.getAttribute("aria-current"),
		).toBe("true");
		// The trigger must not wrap interactive content of its own: the menu
		// lives in a portal, never nested inside the trigger button.
		expect(
			trigger?.querySelector(
				"button, a, input, [role='menuitem'], [role='menuitemcheckbox']",
			),
		).toBeNull();
		expect(trigger?.closest("[role='menu']")).toBeNull();
	});
});

describe("repository switching", () => {
	it("resolves the new repository's own plan and never a leaked pointer", () => {
		storeActivePlanPointer("repo-a", "plan-katalog");
		const { recoverable, container, root } = hydrateFresh(repoA());
		expect(recoverable).toEqual([]);
		expect(triggerText(container)).toContain(KATALOG);

		// Repo B has its own stored preference; repo A's selection must not
		// survive the switch, and repo B's pointer must be honoured.
		storeActivePlanPointer("repo-b", "plan-blog");
		act(() => root.render(<PlanHarness data={repoB()} />));
		expect(triggerText(container)).toContain(BLOG);
		expect(triggerText(container)).not.toContain(KATALOG);

		// An in-session selection survives unrelated storage writes: the user is
		// still on plan-blog, so nothing may silently move them.
		storeActivePlanPointer("repo-b", "plan-missing");
		act(() => root.render(<PlanHarness data={repoB()} />));
		expect(triggerText(container)).toContain(BLOG);

		// A fresh load of repo B with a stale pointer falls back to its own
		// deterministic plan, and repo A's pointer is left untouched.
		act(() => root.unmount());
		container.remove();
		mounted.length = 0;
		storeActivePlanPointer("repo-b", "plan-missing");
		const fresh = hydrateFresh(repoB());
		expect(fresh.recoverable).toEqual([]);
		expect(triggerText(fresh.container)).toContain(CI);
		expect(readActivePlanPointer("repo-b")).toBe("plan-ci");
		expect(readActivePlanPointer("repo-a")).toBe("plan-katalog");
	});

	it("drops a feature created in the previous repository when switching", () => {
		const created = "Fitur Baru Repo A";
		const api: PlanApi = { current: null };
		const { container, root } = hydrateFresh(repoA(), api);
		act(() => {
			api.current?.registerCreatedPlan({ id: "plan-new", name: created });
			api.current?.setActiveFeature({ id: "plan-new", name: created });
		});
		expect(triggerText(container)).toContain(created);

		act(() => root.render(<PlanHarness data={repoB()} api={api} />));
		expect(triggerText(container)).not.toContain(created);
		expect(triggerText(container)).toContain(CI);

		openMenu(container);
		expect(
			document.body.querySelector(
				"[data-testid='codebase-plan-option-plan-new']",
			),
		).toBeNull();
	});
});
