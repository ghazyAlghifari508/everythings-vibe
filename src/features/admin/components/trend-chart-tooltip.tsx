"use client";

import { formatCurrency } from "@/lib/utils";
import type { DailyTrendPoint } from "../types";
import { SVG_WIDTH } from "./trend-chart-constants";

export interface TrendChartTooltipProps {
	hoveredItem: DailyTrendPoint;
	hoveredX: number;
	streamerActive: boolean;
}

export function TrendChartTooltip({
	hoveredItem,
	hoveredX,
	streamerActive,
}: TrendChartTooltipProps) {
	return (
		<div
			className="pointer-events-none absolute z-10 hidden sm:flex flex-col gap-1.5 rounded-lg border border-graphite bg-charcoal/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md transition-transform duration-75"
			style={{
				left: `${(hoveredX / SVG_WIDTH) * 100}%`,
				top: "12px",
				transform:
					hoveredX < SVG_WIDTH * 0.2
						? "translateX(10%)"
						: hoveredX > SVG_WIDTH * 0.8
							? "translateX(-110%)"
							: "translateX(-50%)",
			}}
		>
			<div className="text-[11px] font-medium text-fog">
				{hoveredItem.label} ({hoveredItem.date})
			</div>
			<div className="flex items-center gap-2">
				<span className="h-2 w-2 rounded-full bg-emerald-500" />
				<span className="text-mist">Pendapatan:</span>
				<span className="font-mono font-medium text-emerald-400">
					{streamerActive ? "••••••••" : formatCurrency(hoveredItem.revenue)}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<span className="h-2 w-2 rounded-full bg-indigo-500" />
				<span className="text-mist">Pengguna Baru:</span>
				<span className="font-mono font-medium text-indigo-400">
					{hoveredItem.newUsers} user
				</span>
			</div>
		</div>
	);
}
