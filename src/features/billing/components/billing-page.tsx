import {
	Alert01Icon,
	ArrowRight01Icon,
	CalendarClockIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import type { CreditOperationProduct } from "@/features/billing/services/credit-operation-registry";
import { cancelSubscription } from "@/features/billing/services/payment.functions";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { useUIStore } from "@/store";
import type {
	BillingCreditUsage,
	BillingPaymentItem,
	BillingProductUsage,
	BillingSubscription,
	ProductTrialState,
} from "../services/billing-settings.functions";
import type { ProductChargingState } from "../services/charging-state.functions";
import { getPaymentStatusInfo } from "../utils/payment-status";
import { CreditMeter } from "./credit-meter";
import { CreditUsageSection } from "./credit-usage";
import { PaymentHistoryDialog } from "./payment-history-dialog";

const PRODUCT_USAGE_LABELS: Record<CreditOperationProduct, string> = {
	vibeplan_greenfield: "Greenfield",
	vibeplan_codebase: "Existing Codebase",
	studio: "Studio",
	scrape: "Scrape",
	legacy_unknown: "Legacy tanpa klasifikasi",
};

const TRIAL_PRESENTATION = {
	available: { label: "Tersedia", tone: "success" },
	reserved: { label: "Sedang diproses", tone: "warning" },
	consumed: { label: "Sudah digunakan", tone: "neutral" },
} as const;
export function BillingPage({
	subscription,
	payments: paymentsList,
	creditUsage,
	trials,
	productChargingEnabled,
}: {
	subscription: BillingSubscription | undefined;
	payments: BillingPaymentItem[];
	creditUsage: BillingCreditUsage;
	trials: Record<"studio" | "scrape", ProductTrialState>;
	productChargingEnabled: ProductChargingState;
}) {
	const [cancelOpen, setCancelOpen] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [historyOpen, setHistoryOpen] = useState(false);
	const { data: userPlan } = useUserPlan();

	const handleCancel = async () => {
		setCancelling(true);
		try {
			const res = await cancelSubscription();
			showToast(res.message, res.success ? "success" : "error");
			if (res.success) window.location.reload();
		} catch {
			showToast("Gagal membatalkan langganan. Coba lagi.", "error");
		} finally {
			setCancelling(false);
			setCancelOpen(false);
		}
	};

	// Derived subscription display state (server truth via loader dates).
	const planLabel = subscription?.plan || "free";
	const isPaidPlan = planLabel === "pro" || planLabel === "hengker";
	const periodEndDate = subscription?.currentPeriodEnd
		? new Date(subscription.currentPeriodEnd)
		: null;
	const isPaused =
		isPaidPlan &&
		periodEndDate !== null &&
		periodEndDate.getTime() < Date.now();
	const statusText = isPaidPlan
		? isPaused
			? "Pause, masa aktif habis"
			: periodEndDate
				? `Aktif s.d. ${formatDate(periodEndDate.toISOString())}`
				: "Aktif (paket lama, tanpa masa aktif)"
		: "Gratis";
	const showToast = useUIStore((s) => s.showToast);
	const allocation = userPlan?.credits ?? subscription?.credits ?? 0;
	const creditsUsed = userPlan?.creditsUsed ?? subscription?.creditsUsed ?? 0;
	const creditsReserved = creditUsage.reservedCredits ?? 0;
	// Canonical remaining from getCreditBalance via /api/user/plan. The loader
	// value is only the first-render fallback, never a view-only subtraction.
	const canonicalRemaining = userPlan?.remaining;
	const available =
		typeof canonicalRemaining === "number"
			? canonicalRemaining
			: creditUsage.availableCredits;
	const exempt =
		userPlan?.billingExempt === true || canonicalRemaining === "unlimited";
	const paused = isPaused || userPlan?.subscriptionState === "paused";
	// ponytail: preview shows latest 4-5 transactions to prevent card height stretching.
	const previewPayments = paymentsList.slice(0, 5);
	const productUsage: BillingProductUsage[] =
		creditUsage.productBreakdown.filter((row) => row.credits > 0);
	const productUsageTotal = productUsage.reduce(
		(sum, row) => sum + row.credits,
		0,
	);

	return (
		<div className="w-full flex flex-col gap-6">
			<div className="grid gap-6 lg:grid-cols-2">
				<div className="flex flex-col rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
					<h2 className="mb-6 font-inter font-[510] text-xl font-bold">
						Billing & Kredit
					</h2>
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
						<div>
							<span className="text-3xl font-bold capitalize">
								{planLabel}
								{userPlan?.billingExempt ? (
									<span className="ml-2 align-middle inline-flex items-center rounded-full bg-teal-400/10 px-2.5 py-0.5 text-xs font-semibold text-teal-300 border border-teal-400/20">
										Internal Exempt
									</span>
								) : isPaidPlan && !periodEndDate ? (
									<span className="ml-2 align-middle rounded-full bg-(--bg-surface) px-2 py-0.5 text-xs font-medium text-(--text-secondary)">
										legacy
									</span>
								) : null}
							</span>
							<p
								className={`mt-1 flex items-center gap-1.5 text-sm ${
									isPaused
										? "text-amber-600 dark:text-amber-400"
										: "text-(--text-secondary)"
								}`}
							>
								{isPaused ? (
									<Icon icon={Alert01Icon} size={14} />
								) : (
									<Icon icon={CalendarClockIcon} size={14} />
								)}
								{statusText}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{isPaidPlan && !isPaused && (
								<button
									type="button"
									onClick={() => setCancelOpen(true)}
									className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"
								>
									Cancel Langganan
								</button>
							)}
							<Link
								to="/pricing"
								className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium hover:bg-(--bg-surface)"
							>
								{isPaused ? "Perpanjang" : "Beli Paket"}
							</Link>
						</div>
					</div>

					<div className="mt-6 rounded-lg bg-(--bg-surface) p-4">
						<CreditMeter
							allocation={allocation}
							used={creditsUsed}
							reserved={creditsReserved}
							available={available}
							exempt={exempt}
							paused={paused}
						/>
						{!paused &&
							available <= 0 &&
							isPaidPlan &&
							periodEndDate != null && (
								<p className="mt-1 text-xs text-(--text-secondary)">
									<Link
										to="/pricing"
										className="font-medium underline underline-offset-2"
									>
										Perpanjang atau ubah paket langganan di halaman pricing
									</Link>
								</p>
							)}
					</div>
					<div className="mt-5 border-t border-(--border-subtle) pt-4">
						<h3 className="font-inter text-sm font-[510] text-snow">
							Penggunaan kredit periode ini
						</h3>
						{productUsage.length === 0 ? (
							<p className="mt-2 text-xs text-(--text-secondary)">
								Belum ada kredit terpakai pada periode ini.
							</p>
						) : (
							<dl className="mt-3 space-y-2 text-xs">
								{productUsage.map((row) => (
									<div
										key={row.product}
										className="flex items-center justify-between gap-3"
									>
										<dt className="text-(--text-secondary)">
											{PRODUCT_USAGE_LABELS[row.product]}
										</dt>
										<dd className="font-mono text-snow">
											{row.credits} kredit
										</dd>
									</div>
								))}
								<div className="flex items-center justify-between gap-3 border-t border-(--border-subtle) pt-2 font-medium">
									<dt>Total terpakai</dt>
									<dd className="font-mono">{productUsageTotal} kredit</dd>
								</div>
							</dl>
						)}
						<p className="mt-3 text-xs text-(--text-secondary)">
							Alokasi direset tiap 30 hari. Top up masuk ke saldo periode
							berjalan dan hangus di akhir periode. Kredit tersedia lagi saat
							periode berikutnya dimulai.
						</p>
					</div>

					<div className="mt-5 border-t border-(--border-subtle) pt-4">
						<h3 className="font-inter text-sm font-[510] text-snow">
							Trial fitur
						</h3>
						<div className="mt-3 grid gap-2">
							{(["studio", "scrape"] as const).map((product) => {
								const presentation = TRIAL_PRESENTATION[trials[product]];
								return (
									<div
										key={product}
										className="flex items-center justify-between gap-3 text-xs"
									>
										<span className="capitalize text-fog">{product}</span>
										{isPaidPlan || exempt ? (
											<StatusIndicator tone="success">
												Akses penuh
											</StatusIndicator>
										) : (
											<StatusIndicator tone={presentation.tone}>
												{presentation.label}
											</StatusIndicator>
										)}
									</div>
								);
							})}
						</div>
						<p className="mt-3 text-xs text-(--text-secondary)">
							Trial tidak memotong saldo kredit dan tidak diperbarui tiap bulan.
							{!productChargingEnabled.studio &&
								!productChargingEnabled.scrape &&
								" Studio dan Scrape saat ini tidak memotong kredit."}
						</p>
					</div>
				</div>

				<div className="flex flex-col rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
					<h2 className="mb-4 font-inter font-[510] text-xl font-bold">
						Riwayat Pembayaran
					</h2>
					{paymentsList.length === 0 ? (
						<p className="text-sm text-(--text-secondary)">
							Belum ada pembayaran
						</p>
					) : (
						<div className="flex flex-1 flex-col justify-between">
							<div className="divide-y divide-(--border-subtle)">
								{previewPayments.map((p) => {
									const statusInfo = getPaymentStatusInfo(p.status);
									return (
										<div
											key={p.id}
											className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
										>
											<div className="min-w-0 pr-3">
												<div className="font-medium text-snow truncate">
													{formatCurrency(p.amount ?? 0)}
												</div>
												<div className="mt-0.5 text-xs text-(--text-secondary)">
													{p.createdAt ? formatDateTime(p.createdAt) : "-"}
												</div>
											</div>
											<div className="shrink-0">
												<StatusIndicator
													tone={statusInfo.tone}
													icon={statusInfo.icon}
												>
													{statusInfo.label}
												</StatusIndicator>
											</div>
										</div>
									);
								})}
							</div>
							<div className="mt-4 pt-3 border-t border-(--border-subtle) flex items-center justify-end">
								<button
									type="button"
									onClick={() => setHistoryOpen(true)}
									className="group inline-flex items-center gap-1.5 text-xs font-medium text-mist hover:text-snow transition-colors"
								>
									<span>Lihat semua transaksi</span>
									<Icon
										icon={ArrowRight01Icon}
										size={14}
										className="transition-transform group-hover:translate-x-0.5"
									/>
								</button>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Credit Usage Section */}
			<CreditUsageSection
				operations={creditUsage.operations}
				initialPagination={creditUsage.pagination}
			/>

			{/* Cancel subscription confirmation */}
			{cancelOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full mx-4 max-w-sm rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
						<h3 className="mb-2 font-inter font-[510] text-lg">
							Batalkan Langganan?
						</h3>
						<p className="mb-6 text-sm text-(--text-secondary)">
							Akunmu akan kembali ke paket Free (2 kredit per 30 hari) dan sisa
							kredit {planLabel} kamu hangus. Riwayat pembayaran tetap
							tersimpan. Tindakan ini langsung berlaku.
						</p>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								onClick={() => setCancelOpen(false)}
								className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-(--bg-surface)"
							>
								Kembali
							</button>
							<button
								type="button"
								disabled={cancelling}
								onClick={handleCancel}
								className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
							>
								{cancelling ? "Memproses..." : "Ya, Batalkan"}
							</button>
						</div>
					</div>
				</div>
			)}
			{/* Full payment history dialog */}
			<PaymentHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
		</div>
	);
}
