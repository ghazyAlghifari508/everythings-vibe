// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseStepNav } from "./flow-step-nav";

vi.mock("@tanstack/react-router", () => ({
	useLocation: () => ({ pathname: "/plan/codebase" }),
	useNavigate: () => vi.fn(),
	Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

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

function renderStepper(
	props: Partial<React.ComponentProps<typeof CodebaseStepNav>> = {},
) {
	act(() => {
		root?.render(<CodebaseStepNav step="sync" {...props} />);
	});
	return container;
}

function labels(c: HTMLElement): string[] {
	return [...c.querySelectorAll("li")].map(
		(li) => li.textContent?.replace(/\s*\(.*\)$/, "").trim() ?? "",
	);
}

describe("CodebaseStepNav onboarding shape", () => {
	it("has exactly two steps", () => {
		const c = renderStepper();
		expect(c.querySelectorAll("li")).toHaveLength(2);
		expect(labels(c)).toEqual(["1Sync Codebase", "2Kesimpulan Codebase"]);
	});

	it("has no Pantau Sync step at any position", () => {
		for (const step of ["sync", "summary"] as const) {
			const c = renderStepper({ step });
			expect(c.textContent).not.toMatch(/Pantau Sync/i);
			expect(c.textContent).not.toMatch(/Prompt Sync/i);
		}
	});

	it("marks the first step active and the second locked on the sync step", () => {
		const c = renderStepper({ step: "sync", onSelectStep: vi.fn() });
		const items = [...c.querySelectorAll("li")];
		expect(items[0]?.getAttribute("aria-current")).not.toBeNull();
		expect(items[1]?.getAttribute("aria-current")).toBeNull();
		expect(items[1]?.querySelector("button")?.hasAttribute("disabled")).toBe(
			true,
		);
	});

	it("marks the sync step completed once the conclusion step is active", () => {
		const c = renderStepper({ step: "summary", onSelectStep: vi.fn() });
		const items = [...c.querySelectorAll("li")];
		expect(items[0]?.textContent).toContain("(Selesai)");
		expect(items[1]?.getAttribute("aria-current")).toBe("step");
	});

	it("lets the user go back a step without leaving the flow", () => {
		const onSelectStep = vi.fn();
		const c = renderStepper({ step: "summary", onSelectStep });
		const backButton = [...c.querySelectorAll("li")][0]?.querySelector(
			"button",
		) as HTMLButtonElement;
		expect(backButton.disabled).toBe(false);
		act(() => {
			backButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSelectStep).toHaveBeenCalledWith("sync");
	});

	it("falls back to the sync step for an unrecognised value", () => {
		const c = renderStepper({
			step: "nonsense" as React.ComponentProps<typeof CodebaseStepNav>["step"],
			onSelectStep: vi.fn(),
		});
		const items = [...c.querySelectorAll("li")];
		expect(items[0]?.getAttribute("aria-current")).toBe("step");
	});

	it("keeps step labels readable on narrow viewports", () => {
		// Labels are hidden below `md` in favour of compact numbered markers, so
		// the accessible name must survive even when the text is not visible.
		const c = renderStepper();
		for (const labelSpan of c.querySelectorAll("li span.font-inter")) {
			expect(labelSpan.className).toContain("md:block");
		}
	});
});

describe("onboarding sources carry one sync progress surface", () => {
	const screenConnect = readFileSync(
		"src/components/codebase/screen-connect.tsx",
		"utf8",
	);
	const stageList = readFileSync(
		"src/components/codebase/sync-stage-list.tsx",
		"utf8",
	);
	const planPage = readFileSync("src/routes/plan/codebase.tsx", "utf8");

	it("keeps the step screens free of their own polling loop", () => {
		// Two loops racing the same endpoint is how a flow ends up showing a
		// connection the owner has not observed yet.
		expect(screenConnect).not.toContain("useCodebaseSyncStatus");
		expect(stageList).not.toContain("useCodebaseSyncStatus");
		expect(screenConnect).not.toContain("fetch(");
		expect(stageList).not.toContain("fetch(");
	});

	it("lets exactly one component own the reconciliation loop for onboarding", () => {
		const owners = [planPage, screenConnect, stageList].filter((source) =>
			source.includes("useCodebaseSyncStatus"),
		);
		expect(owners).toHaveLength(1);
	});

	it("no longer contains the removed monitor screen or its labels", () => {
		expect(planPage).not.toMatch(/Pantau Sync/i);
		expect(planPage).not.toMatch(/Kembali ke Prompt Sync/i);
		expect(planPage).not.toMatch(/Prompt Sync/i);
		expect(planPage).not.toContain("components/codebase/sync-status");
		expect(planPage).not.toMatch(/<SyncStatus[\s/>]/);
		expect(screenConnect).not.toMatch(/Pantau Sync/i);
		expect(screenConnect).not.toMatch(/Prompt Sync/i);
	});

	it("maps sync state through the single shared helper", () => {
		// Copy that was re-derived locally is how two screens drift apart on what
		// the server actually said.
		expect(screenConnect).toContain("resolveSyncStageView");
		expect(stageList).toContain("resolveSyncStageView");
	});
});
