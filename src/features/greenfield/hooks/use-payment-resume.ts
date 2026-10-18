"use client";

import { useEffect, useRef } from "react";
import { syncPaymentStatus } from "@/features/billing/services/payment.functions";
import { consumeResumeIntent } from "@/lib/prompt-handoff";

/** Stage a paid generation can resume, as recorded by the payment handoff. */
type ResumeStage = "prd" | "ac" | "task";

interface UsePaymentResumeParams {
	/** Absent while the owning project is still loading — the effect then waits. */
	projectId: string | undefined;
	/** Only resume when the handoff recorded this stage. */
	stage: ResumeStage;
	searchStr: string;
	navigate: (opts: { to: "."; search: object; replace: boolean }) => void;
	/** Start the generation the user already paid for. */
	onResume: () => void;
}

/**
 * Auto-resume a generation after the user returns from the payment provider.
 *
 * Keyed by the raw search string + a per-orderId guard: `new
 * URLSearchParams(searchStr)` is a fresh object every render, and the resume
 * callback changes identity mid-generation, so without this guard the flow
 * could fire duplicate sync/generate calls while the provider's query params
 * are still in the URL. The success path strips those params so history stays
 * clean and the effect cannot re-run.
 */
export function usePaymentResume({
	projectId,
	stage,
	searchStr,
	navigate,
	onResume,
}: UsePaymentResumeParams): void {
	const resumedPaymentsRef = useRef<Set<string>>(new Set());
	// Latest callback without re-running the effect on every render.
	const onResumeRef = useRef(onResume);
	onResumeRef.current = onResume;

	useEffect(() => {
		const params = new URLSearchParams(searchStr);
		const orderId = params.get("order_id");
		const payment = params.get("payment");
		if (!orderId || payment !== "success" || !projectId) return;
		if (resumedPaymentsRef.current.has(orderId)) return;
		resumedPaymentsRef.current.add(orderId);

		(async () => {
			try {
				const res = await syncPaymentStatus({ data: orderId });
				if (!res.success) return;
				if (consumeResumeIntent(projectId) === stage) onResumeRef.current();
				// Strip provider query params via TanStack Router to keep history in sync
				navigate({ to: ".", search: {}, replace: true });
			} catch (e) {
				console.error("Auto-resume payment sync failed:", e);
			}
		})();
	}, [searchStr, navigate, projectId, stage]);
}
