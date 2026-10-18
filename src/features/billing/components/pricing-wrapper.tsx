"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import { useUIStore } from "@/store";
import { prdFyPlans } from "../data/pricing-data";
import { syncPaymentStatus } from "../services/payment.functions";
import { PricingComponent } from "./pricing-card";
import { TopUpCard } from "./top-up-card";

export default function PricingWrapper() {
	const navigate = useNavigate();
	const searchStr = useLocation({ select: (l) => l.searchStr });
	const searchParams = new URLSearchParams(searchStr);
	const showToast = useUIStore((state) => state.showToast);
	const { data: planData, refetch: refetchPlan } = useUserPlan();
	const currentPlan = planData?.plan ?? "free";

	useEffect(() => {
		const orderId = searchParams.get("order_id");
		const payment = searchParams.get("payment");
		const txStatus = searchParams.get("transaction_status");

		if (
			orderId &&
			(payment === "success" ||
				txStatus === "settlement" ||
				txStatus === "capture")
		) {
			const sync = async () => {
				try {
					const res = await syncPaymentStatus({ data: orderId });
					if (res.success && res.plan) {
						refetchPlan();
						showToast(
							`Berhasil beli kredit untuk paket ${res.plan.charAt(0).toUpperCase() + res.plan.slice(1)}!`,
							"success",
						);
						navigate({ to: "/pricing", replace: true });
					}
				} catch (e) {
					console.error("Gagal sinkronisasi pembayaran:", e);
				}
			};
			sync();
		}
	}, [searchParams, showToast, navigate, refetchPlan]);

	const handlePlanSelect = async (planId: string) => {
		if (planId === "free") {
			navigate({ to: "/" });
			return;
		}

		try {
			const res = await fetch("/api/payments/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ planId }),
			});
			const data = await res.json();

			if (!res.ok) {
				if (res.status === 401) {
					navigate({ to: "/login", search: { redirect: "/pricing" } });
				} else {
					showToast(
						data.error || "Terjadi kesalahan saat memproses pembayaran.",
						"error",
					);
				}
				return;
			}

			if (data.redirect_url) {
				window.location.href = data.redirect_url;
			}
		} catch (e: unknown) {
			console.error(e);
			showToast("Gagal menghubungi server.", "error");
		}
	};

	return (
		<>
			<PricingComponent
				plans={prdFyPlans}
				onPlanSelect={handlePlanSelect}
				currentPlan={currentPlan}
				creditsExhausted={planData?.creditsExhausted === true}
			/>
			{planData?.topUpEligible && <TopUpCard className="mt-6" />}
		</>
	);
}
