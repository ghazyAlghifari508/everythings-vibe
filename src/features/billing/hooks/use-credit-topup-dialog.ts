"use client";

import * as React from "react";
import type { UserPlan } from "@/features/billing/hooks/use-user-plan";
import { TOPUP_PACKAGES } from "@/features/billing/types/billing-constants";
import { saveResumeIntent } from "@/lib/prompt-handoff";
import { formatDate } from "@/lib/utils";
import { useUIStore } from "@/store";

export type CreditTopUpView = "topup" | "subscription";

interface UseCreditTopupDialogOptions {
	isOpen: boolean;
	projectId: string;
	stage: "prd" | "ac" | "task";
	title: string;
	currentPlan?: string;
	planData: UserPlan | undefined;
	/** Overrides the default toast-based error reporting (paywall inline UI). */
	onError?: (message: string) => void;
}

export function useCreditTopupDialog({
	isOpen,
	projectId,
	stage,
	title,
	currentPlan = "free",
	planData,
	onError,
}: UseCreditTopupDialogOptions) {
	const fallbackToast = useUIStore((s) => s.showToast);
	const reportError = React.useCallback(
		(message: string) => {
			if (onError) {
				onError(message);
				return;
			}
			fallbackToast(message, "error");
		},
		[onError, fallbackToast],
	);

	// planData may not have loaded yet; fall back to the caller-supplied plan.
	const plan = planData?.plan ?? currentPlan;
	const isPaidTopUp = Boolean(
		plan !== "free" &&
			planData?.topUpEligible &&
			!title.toLowerCase().includes("pro"),
	);

	const [view, setView] = React.useState<CreditTopUpView>(() =>
		isPaidTopUp ? "topup" : "subscription",
	);
	const [selectedPackageId, setSelectedPackageId] = React.useState<string>(
		TOPUP_PACKAGES[0]?.id ?? "topup-15",
	);
	const [loading, setLoading] = React.useState(false);
	// Guards the window between click and the disabled button re-rendering, so
	// a double click cannot create two Midtrans orders.
	const submittingRef = React.useRef(false);

	React.useEffect(() => {
		if (isOpen) {
			setView(isPaidTopUp ? "topup" : "subscription");
		}
	}, [isOpen, isPaidTopUp]);

	const selectedPackage =
		TOPUP_PACKAGES.find((p) => p.id === selectedPackageId) ?? TOPUP_PACKAGES[0];
	const remainingCredits = planData?.remaining ?? planData?.credits ?? 0;
	const formattedExpiry = planData?.currentPeriodEnd
		? formatDate(planData.currentPeriodEnd)
		: null;

	const handlePlanSelect = React.useCallback(
		async (planId: string) => {
			if (planId === "free") return;
			if (submittingRef.current) return;
			submittingRef.current = true;
			setLoading(true);
			try {
				saveResumeIntent(projectId, stage);
				const returnUrl =
					typeof window !== "undefined"
						? `${window.location.pathname}${window.location.search}${window.location.hash}`
						: "/";
				const res = await fetch("/api/payments/create", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						planId,
						returnUrl,
						projectId,
					}),
				});
				const rawData: unknown = await res.json().catch(() => null);
				let apiError: string | undefined;
				let redirectUrl: string | undefined;

				if (typeof rawData === "object" && rawData !== null) {
					if ("error" in rawData && typeof rawData.error === "string") {
						apiError = rawData.error;
					}
					if (
						"redirect_url" in rawData &&
						typeof rawData.redirect_url === "string"
					) {
						redirectUrl = rawData.redirect_url;
					}
				}

				if (!res.ok) {
					if (res.status === 401) {
						window.location.href = `/login?redirect=${encodeURIComponent(returnUrl)}`;
					} else {
						reportError(apiError || "Gagal memproses pembayaran.");
					}
					return;
				}
				if (redirectUrl) {
					window.location.href = redirectUrl;
				}
			} catch {
				reportError("Gagal menghubungi server.");
			} finally {
				submittingRef.current = false;
				setLoading(false);
			}
		},
		[projectId, stage, reportError],
	);

	return {
		view,
		setView,
		isPaidTopUp,
		selectedPackage,
		selectedPackageId,
		setSelectedPackageId,
		loading,
		remainingCredits,
		formattedExpiry,
		handlePlanSelect,
	};
}
