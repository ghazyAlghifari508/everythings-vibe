import { memo } from "react";
import type { AdminCreditBreakdownItem } from "../types/admin-credit";

interface AdminCreditBreakdownChartProps {
	items: readonly AdminCreditBreakdownItem[];
}

export const AdminCreditBreakdownChart = memo(
	function AdminCreditBreakdownChart({
		items,
	}: AdminCreditBreakdownChartProps) {
		const max = Math.max(1, ...items.map((item) => item.settledCredits));

		return (
			<section className="rounded-xl border border-graphite bg-charcoal p-5 shadow-[var(--shadow-inset)]">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-base font-[510] text-snow">
						Penggunaan berdasarkan fitur
					</h2>
					<p className="text-xs text-fog">
						Kredit debit terverifikasi, bukan reservasi atau tagihan shadow
					</p>
				</div>
				<div className="mt-5 space-y-3">
					{items.map((item) => {
						const width = Math.round((item.settledCredits / max) * 100);
						const label = `${item.label}: ${item.settledCredits} kredit dari ${item.settledOperations} operasi terverifikasi`;
						return (
							<div
								key={item.product}
								className="grid grid-cols-[minmax(110px,150px)_1fr_auto] items-center gap-3"
							>
								<span className="truncate text-xs text-fog">{item.label}</span>
								<div
									className="h-2 w-full rounded-[3px] bg-graphite/60"
									role="img"
									aria-label={label}
								>
									<div
										className="h-2 rounded-[3px] bg-fog"
										style={{ width: `${width}%` }}
									/>
								</div>
								<span className="text-right font-mono text-xs text-snow">
									{item.settledCredits.toLocaleString("id-ID")}
								</span>
							</div>
						);
					})}
				</div>
			</section>
		);
	},
);
