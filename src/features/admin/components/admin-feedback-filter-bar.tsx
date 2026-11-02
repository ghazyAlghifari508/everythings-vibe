"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

export interface AdminFeedbackFilterBarProps {
	currentTab: "feedback" | "errors";
	onTabChange: (tab: "feedback" | "errors") => void;
	activeType: string;
	onTypeChange: (type: string) => void;
	search: string;
	onSearchChange: (search: string) => void;
	feedbackTotal: number;
	errorTotal: number;
}

export function AdminFeedbackFilterBar({
	currentTab,
	onTabChange,
	activeType,
	onTypeChange,
	search,
	onSearchChange,
	feedbackTotal,
	errorTotal,
}: AdminFeedbackFilterBarProps) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex gap-1.5 overflow-x-auto">
				<button
					type="button"
					onClick={() => onTabChange("feedback")}
					className={`rounded-md px-3 py-1.5 text-xs font-[510] transition-colors ${
						currentTab === "feedback"
							? "bg-snow text-onyx font-semibold"
							: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
					}`}
				>
					Feedback Pengguna ({feedbackTotal.toLocaleString("id-ID")})
				</button>

				<button
					type="button"
					onClick={() => onTabChange("errors")}
					className={`rounded-md px-3 py-1.5 text-xs font-[510] transition-colors ${
						currentTab === "errors"
							? "bg-snow text-onyx font-semibold"
							: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
					}`}
				>
					Laporan Error ({errorTotal.toLocaleString("id-ID")})
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{/* Type filter for feedback */}
				{currentTab === "feedback" && (
					<div className="flex gap-1">
						{(["all", "bug", "feature", "general"] as const).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => onTypeChange(t)}
								className={`rounded px-2 py-1 text-[11px] font-[510] capitalize transition-colors ${
									activeType === t
										? "bg-white/15 text-snow border border-graphite"
										: "text-fog hover:text-snow"
								}`}
							>
								{t === "all" ? "Semua" : t}
							</button>
						))}
					</div>
				)}

				<div className="relative w-48 sm:w-64">
					<Icon
						icon={Search01Icon}
						size={14}
						className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog"
					/>
					<input
						type="text"
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder={
							currentTab === "feedback"
								? "Cari masukan atau pengirim..."
								: "Cari pesan error, konteks, user..."
						}
						className="w-full rounded-lg border border-graphite bg-charcoal py-1.5 pl-8 pr-3 text-xs text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
					/>
				</div>
			</div>
		</div>
	);
}
