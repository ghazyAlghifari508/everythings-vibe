import { describe, expect, it } from "vitest";
import {
	type CtaAvailability,
	type CtaOperation,
	deriveWorkspaceCta,
} from "../utils/flow-cta";

const ID = "p1";
const idle: CtaOperation = {
	prdGenerating: false,
	acGenerating: false,
	advancing: false,
};
const base: CtaAvailability = {
	projectId: ID,
	hasPrd: false,
	hasAc: false,
	hasTasks: false,
	featuresStatus: "completed",
};

function cta(
	route: Parameters<typeof deriveWorkspaceCta>[0]["route"],
	a: Partial<CtaAvailability> | null,
	opts: { isFree?: boolean; op?: Partial<CtaOperation> } = {},
) {
	return deriveWorkspaceCta({
		route,
		projectId: ID,
		availability: a === null ? null : { ...base, ...a },
		isFree: opts.isFree ?? false,
		op: { ...idle, ...opts.op },
	});
}

describe("deriveWorkspaceCta on /prd", () => {
	it("enables Generate AC once the PRD is persisted, whatever the parent step says", () => {
		expect(cta("prd", { hasPrd: true })).toMatchObject({
			kind: "generate",
			label: "Generate AC",
			target: "ac",
			disabled: false,
		});
	});

	it("keeps Generate AC disabled (never a back action) while no PRD is persisted", () => {
		const result = cta("prd", { hasPrd: false });
		expect(result).toMatchObject({
			kind: "generate",
			label: "Generate AC",
			disabled: true,
		});
	});

	it("keeps Generate AC disabled while the PRD stream is running, even with an old saved PRD", () => {
		expect(
			cta("prd", { hasPrd: true }, { op: { prdGenerating: true } }),
		).toMatchObject({ kind: "generate", disabled: true });
	});

	it("disables during the advance request so a double click cannot fire twice", () => {
		expect(
			cta("prd", { hasPrd: true }, { op: { advancing: true } }),
		).toMatchObject({ disabled: true, busyLabel: "Memuat..." });
	});

	it("opens the existing AC instead of regenerating", () => {
		expect(cta("prd", { hasPrd: true, hasAc: true })).toEqual({
			kind: "navigate",
			label: "Lanjut ke AC",
			target: "ac",
		});
	});

	it("opens the existing Task view once tasks exist", () => {
		expect(cta("prd", { hasPrd: true, hasAc: true, hasTasks: true })).toEqual({
			kind: "navigate",
			label: "Lanjut ke Task",
			target: "task",
		});
	});

	it("routes free plans to the paywall regardless of artifacts", () => {
		expect(cta("prd", { hasPrd: true }, { isFree: true })).toEqual({
			kind: "upgrade",
		});
		expect(cta("prd", { hasPrd: false }, { isFree: true })).toEqual({
			kind: "upgrade",
		});
	});
});

describe("deriveWorkspaceCta on /ac", () => {
	it("disables Generate Task until AC is persisted", () => {
		expect(cta("ac", { hasPrd: true })).toMatchObject({
			kind: "generate",
			label: "Generate Task",
			disabled: true,
			busyLabel: "Menyusun AC...",
		});
	});

	it("disables while AC is generating even if an older AC exists", () => {
		expect(
			cta("ac", { hasPrd: true, hasAc: true }, { op: { acGenerating: true } }),
		).toMatchObject({ disabled: true });
	});

	it("enables Generate Task once AC is persisted", () => {
		expect(cta("ac", { hasPrd: true, hasAc: true })).toMatchObject({
			kind: "generate",
			target: "task",
			disabled: false,
		});
	});

	it("opens existing tasks instead of regenerating", () => {
		expect(cta("ac", { hasPrd: true, hasAc: true, hasTasks: true })).toEqual({
			kind: "navigate",
			label: "Lanjut ke Task",
			target: "task",
		});
	});

	it("routes free plans to upgrade", () => {
		expect(cta("ac", { hasAc: true }, { isFree: true })).toEqual({
			kind: "upgrade",
		});
	});
});

describe("deriveWorkspaceCta on /fitur", () => {
	it("offers Generate PRD, disabled while the tree is still generating", () => {
		expect(cta("fitur", {})).toMatchObject({
			kind: "generate",
			target: "prd",
			disabled: false,
		});
		expect(cta("fitur", { featuresStatus: "generating" })).toMatchObject({
			disabled: true,
			busyLabel: "Menyusun fitur...",
		});
	});

	it("opens the existing PRD instead of regenerating", () => {
		expect(cta("fitur", { hasPrd: true })).toEqual({
			kind: "navigate",
			label: "Lanjut ke PRD",
			target: "prd",
		});
	});
});

describe("deriveWorkspaceCta isolation", () => {
	it("is hidden without a snapshot (loading) and for another project's snapshot", () => {
		expect(cta("prd", null)).toEqual({ kind: "hidden" });
		expect(
			deriveWorkspaceCta({
				route: "prd",
				projectId: "other",
				availability: { ...base, hasPrd: true },
				isFree: false,
				op: idle,
			}),
		).toEqual({ kind: "hidden" });
	});

	it("shows nothing on task and ask routes", () => {
		expect(cta("task", { hasTasks: true })).toEqual({ kind: "hidden" });
		expect(cta("question", { hasPrd: true })).toEqual({ kind: "hidden" });
	});
});
