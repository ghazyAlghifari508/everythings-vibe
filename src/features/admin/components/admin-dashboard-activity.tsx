import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { findTopUpPackage } from "@/features/billing/types/billing-constants";
import { getPaymentStatusInfo } from "@/features/billing/utils/payment-status";
import { APP_TIME_ZONE } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import type { AdminDashboardMetrics } from "../types";

function PaymentStatusLabel({ status }: { status: string }) {
	const info = getPaymentStatusInfo(status);
	return (
		<StatusIndicator tone={info.tone} icon={info.icon}>
			{info.label}
		</StatusIndicator>
	);
}

function PaymentPlanBadge({ plan }: { plan: string }) {
	const value = plan.toLowerCase();
	const topUp = findTopUpPackage(value);
	const label =
		value === "hengker"
			? "Paket Hengker"
			: value === "pro"
				? "Paket Pro"
				: topUp
					? `Top up ${topUp.credits} kredit`
					: value === "topup"
						? "Top up kredit"
						: "Paket lain";
	return <Badge>{label}</Badge>;
}

const PROJECT_STEP_LABELS: Record<string, string> = {
	question: "Tanya Jawab",
	fitur: "Fitur",
	prd: "PRD",
	ac: "AC",
	task: "Task",
};

function StepBadge({ step }: { step: string | null }) {
	const value = (step ?? "prd").toLowerCase();
	return <Badge>{PROJECT_STEP_LABELS[value] ?? value}</Badge>;
}

/** Same authorized targets as the Admin Projects table. */
function projectTargetRoute(
	step: string | null,
): "/prd/$id" | "/ac/$id" | "/task/$id" {
	if (step === "task") return "/task/$id";
	if (step === "ac") return "/ac/$id";
	return "/prd/$id";
}

function formatShortDate(date: Date | string | null | undefined): string {
	if (!date) return "-";
	const d = new Date(date);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: APP_TIME_ZONE,
	});
}

export function AdminDashboardActivity({
	metrics,
}: {
	metrics: AdminDashboardMetrics;
}) {
	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<section className="flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 shadow-[var(--shadow-inset)]">
				<div>
					<div className="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2 className="text-base font-[510] text-snow">
								Transaksi Terbaru
							</h2>
							<p className="text-xs text-fog">
								Pembelian paket dan top-up kredit
							</p>
						</div>
						<Link
							to="/admin/transactions"
							className="text-xs font-medium text-fog transition-colors hover:text-snow"
						>
							Lihat Semua
						</Link>
					</div>

					{metrics.recentTransactions.length === 0 ? (
						<div className="py-12 text-center text-xs text-fog">
							Belum ada transaksi tercatat.
						</div>
					) : (
						<div className="divide-y divide-graphite rounded-lg border border-graphite bg-obsidian">
							{metrics.recentTransactions.map((tx) => (
								<div
									key={tx.id}
									className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-white/[0.02]"
								>
									<div className="min-w-0 flex-1 pr-2">
										<div className="flex items-center gap-2">
											<span className="font-mono text-xs font-medium text-snow">
												{tx.orderId}
											</span>
											<PaymentPlanBadge plan={tx.plan} />
										</div>
										<p className="mt-1 truncate text-xs text-fog">
											{tx.userName || tx.userEmail || "Anonymous"}
										</p>
										<p className="truncate text-xs text-fog">
											{formatShortDate(tx.createdAt)}
										</p>
									</div>
									<div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
										<PaymentStatusLabel status={tx.status} />
										<span className="font-mono text-xs font-medium text-snow">
											{formatCurrency(tx.amount)}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</section>

			<section className="flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 shadow-[var(--shadow-inset)]">
				<div>
					<div className="mb-4 flex items-center justify-between gap-3">
						<div>
							<h2 className="text-base font-[510] text-snow">Proyek Terbaru</h2>
							<p className="text-xs text-fog">
								Proyek aktif yang dibuat terakhir
							</p>
						</div>
						<Link
							to="/admin/projects"
							className="text-xs font-medium text-fog transition-colors hover:text-snow"
						>
							Kelola Proyek
						</Link>
					</div>

					{metrics.recentProjects.length === 0 ? (
						<div className="py-12 text-center text-xs text-fog">
							Belum ada proyek aktif.
						</div>
					) : (
						<div className="divide-y divide-graphite rounded-lg border border-graphite bg-obsidian">
							{metrics.recentProjects.map((p) => (
								<div
									key={p.id}
									className="flex items-center justify-between p-3.5 transition-colors hover:bg-white/[0.02]"
								>
									<div className="min-w-0 flex-1 pr-3">
										<p className="truncate text-sm font-[510] text-snow">
											{p.name}
										</p>
										<p className="mt-0.5 truncate text-xs text-fog">
											{p.userName || p.userEmail}
										</p>
										<p className="truncate text-xs text-fog">
											{formatShortDate(p.createdAt)}
										</p>
									</div>
									<div className="flex items-center gap-2.5 shrink-0">
										<span className="hidden text-[11px] text-fog sm:inline">
											{p.projectMode === "existing_codebase"
												? "Codebase"
												: p.projectMode === "greenfield"
													? "Greenfield"
													: "Proyek"}
										</span>
										<StepBadge step={p.step} />
										<Link
											to={projectTargetRoute(p.step)}
											params={{ id: p.id }}
											className="rounded p-1 text-fog transition-colors hover:bg-white/5 hover:text-snow"
											title="Buka proyek"
										>
											<Icon icon={ArrowUpRight01Icon} size={16} />
										</Link>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
