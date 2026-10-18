import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Trash2 } from "lucide-react";
import { useState } from "react";
import { cancelSubscription } from "@/features/billing/services/payment.functions";
import { TOPUP_SKU } from "@/features/billing/types/billing-constants";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { useUIStore } from "@/store";
import {
	type BillingCreditUsage,
	type BillingPaymentItem,
	type BillingSubscription,
	deletePayment,
} from "../services/billing-settings.functions";
import { CreditUsageSection } from "./credit-usage";

export function BillingPage({
	subscription,
	payments: initialPayments,
	creditUsage,
}: {
	subscription: BillingSubscription | undefined;
	payments: BillingPaymentItem[];
	creditUsage: BillingCreditUsage;
}) {
	const [paymentsList, setPaymentsList] = useState(initialPayments);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [cancelling, setCancelling] = useState(false);

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
			? "Pause — masa aktif habis"
			: periodEndDate
				? `Aktif s.d. ${formatDate(periodEndDate.toISOString())}`
				: "Aktif (paket lama, tanpa masa aktif)"
		: "Gratis";
	const showToast = useUIStore((s) => s.showToast);
	const credits = subscription?.credits ?? 0;
	const creditsUsed = subscription?.creditsUsed ?? 0;
	const creditsReserved = subscription?.creditsReserved ?? 0;
	const remaining = Math.max(0, credits - creditsUsed - creditsReserved);

	const handleDelete = async (id: string) => {
		try {
			const res = await deletePayment({ data: id });
			if (res.success) {
				setPaymentsList((prev) => prev.filter((p) => p.id !== id));
				showToast("Riwayat pembayaran berhasil dihapus", "success");
			} else {
				showToast("Riwayat pembayaran berhasil tidak dapat dihapus", "error");
			}
		} catch {
			showToast("Gagal menghapus riwayat pembayaran", "error");
		} finally {
			setDeleteId(null);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="grid gap-6 lg:grid-cols-2 h-full">
				<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
					<h2 className="mb-6 font-inter font-[510] text-xl font-bold">
						Billing & Kredit
					</h2>
					<div className="flex items-center justify-between">
						<div>
							<span className="text-3xl font-bold capitalize">
								{planLabel}
								{isPaidPlan && !periodEndDate ? (
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
									<AlertTriangle size={14} />
								) : (
									<CalendarClock size={14} />
								)}
								{statusText}
							</p>
						</div>
						<div className="flex items-center gap-2">
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
						<div className="mb-2 flex justify-between text-sm">
							<span className="text-(--text-secondary)">Kredit digunakan</span>
							<span className="font-medium">
								{creditsUsed} / {credits}
								{creditsReserved > 0 && (
									<span className="ml-1 text-xs text-amber-400 font-normal">
										({creditsReserved} direservasi)
									</span>
								)}
							</span>
						</div>
						<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-(--bg-card)">
							<div
								className="h-full rounded-full bg-indigo transition-all"
								style={{
									width: `${credits > 0 ? (creditsUsed / credits) * 100 : 0}%`,
								}}
							/>
						</div>
						<p className="mt-2 text-xs text-(--text-secondary)">
							{isPaused
								? "Masa aktif habis — sisa kredit periode lama hangus. Perpanjang untuk dapat kredit segar."
								: remaining > 0
									? `Sisa ${remaining} kredit periode ini.${creditsReserved > 0 ? ` (${creditsReserved} sedang direservasi).` : ""} Kredit reset setiap 30 hari.`
									: "Kredit periode ini habis. Perpanjang atau tunggu reset berikutnya."}
						</p>
						{!isPaused &&
							remaining === 0 &&
							isPaidPlan &&
							periodEndDate != null && (
								<p className="mt-1 text-xs text-(--text-secondary)">
									<Link
										to="/pricing"
										hash="topup"
										className="font-medium underline underline-offset-2"
									>
										Atau top up {TOPUP_SKU.credits} kredit (Rp{" "}
										{(TOPUP_SKU.priceIdr as number).toLocaleString("id-ID")})
										tanpa menambah masa aktif
									</Link>
								</p>
							)}
					</div>
				</div>

				<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
					<h2 className="mb-6 font-inter font-[510] text-xl font-bold">
						Riwayat Pembayaran
					</h2>
					{paymentsList.length === 0 ? (
						<p className="text-sm text-(--text-secondary)">
							Belum ada pembayaran
						</p>
					) : (
						<div className="space-y-3">
							{paymentsList.map((p) => (
								<div
									key={p.id}
									className="flex items-center justify-between rounded-lg border border-(--border-subtle) p-4 text-sm"
								>
									<div>
										<div className="font-medium">
											{formatCurrency(p.amount ?? 0)}
										</div>
										{/* Time included: payment history is a ledger of instants,
										    and the date alone hid which day a late-evening
										    transaction belonged to. */}
										<div className="mt-1 text-xs text-(--text-secondary)">
											{p.createdAt ? formatDateTime(p.createdAt) : "—"}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span
											className={`rounded-full px-3 py-1 text-xs font-medium ${
												p.status === "success"
													? "bg-green-100 text-green-800"
													: "bg-red-100 text-red-800"
											}`}
										>
											{p.status === "success" ? "Berhasil" : "Gagal"}
										</span>
										{p.status !== "success" && (
											<button
												type="button"
												onClick={() => setDeleteId(p.id)}
												className="rounded p-1.5 text-fog hover:bg-red-500/10 hover:text-red-400 transition-colors"
												aria-label="Hapus riwayat"
											>
												<Trash2 size={14} />
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Credit Usage Section */}
			<CreditUsageSection operations={creditUsage.operations} />

			{/* Cancel subscription confirmation */}
			{cancelOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="w-full mx-4 max-w-sm rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
						<h3 className="mb-2 font-inter font-[510] text-lg">
							Batalkan Langganan?
						</h3>
						<p className="mb-6 text-sm text-(--text-secondary)">
							Akunmu akan kembali ke paket Free (2 kredit PRD per bulan) dan
							sisa kredit {planLabel} kamu hangus. Riwayat pembayaran tetap
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

			{/* Delete confirmation dialog */}
			{deleteId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6 max-w-sm w-full mx-4">
						<h3 className="font-inter font-[510] text-lg mb-2">
							Hapus Riwayat?
						</h3>
						<p className="text-sm text-(--text-secondary) mb-6">
							Riwayat pembayaran ini akan dihapus permanen. Tindakan ini tidak
							dapat dibatalkan.
						</p>
						<div className="flex justify-end gap-3">
							<button
								type="button"
								onClick={() => setDeleteId(null)}
								className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-(--bg-surface)"
							>
								Batal
							</button>
							<button
								type="button"
								onClick={() => handleDelete(deleteId)}
								className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
							>
								Hapus
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
