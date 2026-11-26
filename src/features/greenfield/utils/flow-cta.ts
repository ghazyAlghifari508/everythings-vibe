// Pure primary-CTA policy for the workspace navbar. Inputs are explicit:
// persisted artifact availability (parent loader), plan entitlement and live
// operation flags. The URL only selects which stage is being viewed; it never
// proves an artifact exists, and the persisted step never gates a forward CTA.
import type { FlowStep } from "./flow-step";
import type { WorkspaceAvailability } from "./workspace-routing";

export type CtaAvailability = Pick<
	WorkspaceAvailability,
	"projectId" | "hasPrd" | "hasAc" | "hasTasks" | "featuresStatus"
>;

export interface CtaOperation {
	/** PRD stream running or streamed text not yet confirmed saved. */
	prdGenerating: boolean;
	acGenerating: boolean;
	/** Advance request in flight (double-click guard). */
	advancing: boolean;
}

export type WorkspaceCta =
	| { kind: "hidden" }
	| { kind: "upgrade" }
	| { kind: "navigate"; label: string; target: FlowStep }
	| {
			kind: "generate";
			label: string;
			target: "prd" | "ac" | "task";
			disabled: boolean;
			/** Replaces the label while disabled for a running operation. */
			busyLabel?: string;
			hint?: string;
	  };

export function deriveWorkspaceCta(input: {
	route: FlowStep;
	projectId: string;
	availability: CtaAvailability | null;
	isFree: boolean;
	op: CtaOperation;
}): WorkspaceCta {
	const { route, projectId, availability: a, isFree, op } = input;
	// Snapshot of another project (mid project switch) must never drive a CTA.
	if (!a || a.projectId !== projectId) return { kind: "hidden" };

	if (route === "fitur") {
		if (a.hasPrd)
			return { kind: "navigate", label: "Lanjut ke PRD", target: "prd" };
		const generating = a.featuresStatus === "generating";
		return {
			kind: "generate",
			label: "Generate PRD",
			target: "prd",
			disabled: generating || op.advancing,
			hint: generating
				? "Daftar fitur masih disusun. Tunggu hingga selesai."
				: undefined,
		};
	}

	if (route === "prd") {
		if (isFree) return { kind: "upgrade" };
		if (a.hasTasks)
			return { kind: "navigate", label: "Lanjut ke Task", target: "task" };
		if (a.hasAc)
			return { kind: "navigate", label: "Lanjut ke AC", target: "ac" };
		// Forward stays visible but inert until the PRD is persisted; it never
		// flips to a back action while saving or revalidating.
		const ready = a.hasPrd && !op.prdGenerating;
		return {
			kind: "generate",
			label: "Generate AC",
			target: "ac",
			disabled: !ready || op.advancing,
			busyLabel: op.advancing ? "Memuat..." : undefined,
			hint: ready ? undefined : "PRD belum tersimpan. Tunggu hingga selesai.",
		};
	}

	if (route === "ac") {
		if (isFree) return { kind: "upgrade" };
		if (a.hasTasks)
			return { kind: "navigate", label: "Lanjut ke Task", target: "task" };
		const acReady = a.hasAc && !op.acGenerating;
		return {
			kind: "generate",
			label: "Generate Task",
			target: "task",
			disabled: !acReady || op.advancing,
			hint: acReady ? undefined : "AC belum tersimpan. Tunggu hingga selesai.",
		};
	}

	return { kind: "hidden" };
}
