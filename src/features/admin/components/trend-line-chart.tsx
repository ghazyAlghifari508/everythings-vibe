"use client";

import { TrendingUp } from "lucide-react";
import type React from "react";
import { useCallback, useId, useMemo, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import type { DailyTrendPoint } from "../types";
import {
	calculateYScale,
	generateAreaPath,
	generateSplinePath,
} from "../utils/chart-math";
import { useStreamerMode } from "./streamer-mode-context";
import {
	PADDING_BOTTOM,
	PADDING_LEFT,
	PADDING_RIGHT,
	PADDING_TOP,
	RANGE_OPTIONS,
	SVG_HEIGHT,
	SVG_WIDTH,
} from "./trend-chart-constants";
import { TrendChartSvg } from "./trend-chart-svg";
import { TrendChartTooltip } from "./trend-chart-tooltip";

export interface TrendLineChartProps {
	initialData?: DailyTrendPoint[];
	data?: DailyTrendPoint[];
	onRangeChange?: (days: number) => void;
	isStreamerMode?: boolean;
	className?: string;
}

export function TrendLineChart({
	initialData = [],
	data,
	onRangeChange,
	isStreamerMode: propStreamerMode,
	className,
}: TrendLineChartProps) {
	const chartId = useId().replace(/:/g, "_");
	const revGradId = `rev-grad-${chartId}`;
	const userGradId = `user-grad-${chartId}`;

	const { isStreamerMode: contextStreamerMode } = useStreamerMode();
	const streamerActive =
		propStreamerMode !== undefined ? propStreamerMode : contextStreamerMode;

	const [selectedRange, setSelectedRange] = useState<number>(7);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);

	const rawData = data ?? initialData;
	const currentData = useMemo(() => {
		if (rawData.length <= selectedRange) return rawData;
		return rawData.slice(-selectedRange);
	}, [rawData, selectedRange]);

	const pointCount = currentData.length;
	const chartWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
	const baselineY = SVG_HEIGHT - PADDING_BOTTOM;

	const handleRangeChange = (days: number) => {
		setSelectedRange(days);
		setHoverIndex(null);
		onRangeChange?.(days);
	};

	const totalRevenue = useMemo(
		() =>
			currentData.reduce(
				(acc, curr) => acc + (Number.isFinite(curr.revenue) ? curr.revenue : 0),
				0,
			),
		[currentData],
	);

	const totalNewUsers = useMemo(
		() =>
			currentData.reduce(
				(acc, curr) =>
					acc + (Number.isFinite(curr.newUsers) ? curr.newUsers : 0),
				0,
			),
		[currentData],
	);

	const getX = useCallback(
		(index: number) => {
			if (pointCount <= 1) return PADDING_LEFT + chartWidth / 2;
			return PADDING_LEFT + (index / (pointCount - 1)) * chartWidth;
		},
		[pointCount, chartWidth],
	);

	const revValues = useMemo(
		() => currentData.map((d) => d.revenue),
		[currentData],
	);
	const userValues = useMemo(
		() => currentData.map((d) => d.newUsers),
		[currentData],
	);

	const revScaleInfo = useMemo(
		() =>
			calculateYScale(
				revValues,
				SVG_HEIGHT,
				PADDING_TOP,
				PADDING_BOTTOM,
				100000,
			),
		[revValues],
	);

	const userScaleInfo = useMemo(
		() =>
			calculateYScale(userValues, SVG_HEIGHT, PADDING_TOP, PADDING_BOTTOM, 4),
		[userValues],
	);

	const revPoints = useMemo(
		() =>
			currentData.map((d, i) => ({
				x: getX(i),
				y: revScaleInfo.scale(d.revenue),
			})),
		[currentData, getX, revScaleInfo],
	);

	const userPoints = useMemo(
		() =>
			currentData.map((d, i) => ({
				x: getX(i),
				y: userScaleInfo.scale(d.newUsers),
			})),
		[currentData, getX, userScaleInfo],
	);

	const revSpline = useMemo(() => generateSplinePath(revPoints), [revPoints]);
	const revArea = useMemo(
		() => generateAreaPath(revPoints, baselineY),
		[revPoints, baselineY],
	);

	const userSpline = useMemo(
		() => generateSplinePath(userPoints),
		[userPoints],
	);
	const userArea = useMemo(
		() => generateAreaPath(userPoints, baselineY),
		[userPoints, baselineY],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<SVGSVGElement>) => {
			if (pointCount === 0) return;
			const rect = e.currentTarget.getBoundingClientRect();
			const relativeX = (e.clientX - rect.left) * (SVG_WIDTH / rect.width);

			let closestIdx = 0;
			let minDiff = Number.POSITIVE_INFINITY;

			for (let i = 0; i < pointCount; i++) {
				const x = getX(i);
				const diff = Math.abs(x - relativeX);
				if (diff < minDiff) {
					minDiff = diff;
					closestIdx = i;
				}
			}

			setHoverIndex(closestIdx);
		},
		[pointCount, getX],
	);

	const handleMouseLeave = useCallback(() => {
		setHoverIndex(null);
	}, []);

	const hoveredItem =
		hoverIndex !== null && currentData[hoverIndex]
			? currentData[hoverIndex]
			: null;
	const hoveredX = hoverIndex !== null ? getX(hoverIndex) : null;
	const hoveredRevY =
		hoverIndex !== null && currentData[hoverIndex]
			? revScaleInfo.scale(currentData[hoverIndex].revenue)
			: null;
	const hoveredUserY =
		hoverIndex !== null && currentData[hoverIndex]
			? userScaleInfo.scale(currentData[hoverIndex].newUsers)
			: null;

	return (
		<div
			className={cn(
				"flex flex-col gap-4 rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 shadow-[var(--shadow-inset)] font-inter",
				className,
			)}
		>
			{/* Header: Title, Controls, and Totals */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<div className="flex items-center gap-2">
						<TrendingUp size={16} className="text-emerald-400" />
						<h2 className="text-base font-[510] text-snow">
							Tren {selectedRange} Hari Terakhir
						</h2>
					</div>
					<p className="mt-0.5 text-xs text-fog">
						Performa pendapatan dan pendaftaran baru dari data nyata.
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
					{/* Range Filter Buttons */}
					<div className="flex rounded-lg border border-graphite bg-obsidian p-0.5">
						{RANGE_OPTIONS.map((opt) => {
							const isSelected = selectedRange === opt.days;
							return (
								<button
									key={opt.days}
									type="button"
									onClick={() => handleRangeChange(opt.days)}
									className={cn(
										"rounded-md px-2.5 py-1 text-xs font-[510] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fog/40",
										isSelected
											? "bg-white/15 text-snow shadow-sm"
											: "text-fog hover:text-snow",
									)}
								>
									{opt.label}
								</button>
							);
						})}
					</div>

					{/* Legend & Totals */}
					<div className="flex items-center gap-3 rounded-lg border border-graphite bg-obsidian/70 px-3 py-1.5 text-xs">
						<div className="flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-full bg-emerald-500" />
							<span className="text-fog">Pendapatan:</span>
							<span className="font-mono font-medium text-snow">
								{streamerActive ? "••••••••" : formatCurrency(totalRevenue)}
							</span>
						</div>
						<div className="h-3 w-[1px] bg-graphite" />
						<div className="flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-full bg-indigo-500" />
							<span className="text-fog">Pengguna Baru:</span>
							<span className="font-mono font-medium text-snow">
								{totalNewUsers}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Chart Display Area */}
			<div className="relative w-full overflow-hidden select-none">
				{pointCount === 0 ? (
					<div className="flex h-64 items-center justify-center text-xs text-fog">
						Belum ada data tren untuk periode ini
					</div>
				) : (
					<>
						<TrendChartSvg
							revGradId={revGradId}
							userGradId={userGradId}
							streamerActive={streamerActive}
							pointCount={pointCount}
							currentData={currentData}
							revScaleInfo={revScaleInfo}
							userScaleInfo={userScaleInfo}
							revArea={revArea}
							userArea={userArea}
							revSpline={revSpline}
							userSpline={userSpline}
							hoveredX={hoveredX}
							hoveredRevY={hoveredRevY}
							hoveredUserY={hoveredUserY}
							getX={getX}
							baselineY={baselineY}
							onMouseMove={handleMouseMove}
							onMouseLeave={handleMouseLeave}
						/>

						{hoveredItem && hoveredX !== null && (
							<TrendChartTooltip
								hoveredItem={hoveredItem}
								hoveredX={hoveredX}
								streamerActive={streamerActive}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}
