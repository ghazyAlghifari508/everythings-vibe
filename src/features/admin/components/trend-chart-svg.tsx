"use client";

import type React from "react";
import type { DailyTrendPoint } from "../types";
import {
	formatCompactCurrency,
	PADDING_LEFT,
	PADDING_RIGHT,
	PADDING_TOP,
	SVG_HEIGHT,
	SVG_WIDTH,
} from "./trend-chart-constants";

export interface TrendChartSvgProps {
	revGradId: string;
	userGradId: string;
	streamerActive: boolean;
	pointCount: number;
	currentData: DailyTrendPoint[];
	revScaleInfo: { ticks: number[]; scale: (val: number) => number };
	userScaleInfo: { ticks: number[]; scale: (val: number) => number };
	revArea: string;
	userArea: string;
	revSpline: string;
	userSpline: string;
	hoveredX: number | null;
	hoveredRevY: number | null;
	hoveredUserY: number | null;
	getX: (index: number) => number;
	baselineY: number;
	onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
	onMouseLeave: () => void;
}

export function TrendChartSvg({
	revGradId,
	userGradId,
	streamerActive,
	pointCount,
	currentData,
	revScaleInfo,
	userScaleInfo,
	revArea,
	userArea,
	revSpline,
	userSpline,
	hoveredX,
	hoveredRevY,
	hoveredUserY,
	getX,
	baselineY,
	onMouseMove,
	onMouseLeave,
}: TrendChartSvgProps) {
	const step =
		pointCount <= 8 ? 1 : pointCount <= 14 ? 2 : pointCount <= 21 ? 3 : 4;

	return (
		<svg
			viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
			className="w-full h-auto max-h-[340px] overflow-visible cursor-crosshair"
			onMouseMove={onMouseMove}
			onMouseLeave={onMouseLeave}
			role="img"
			aria-label="Grafik tren pendapatan dan pengguna baru"
		>
			<defs>
				{/* Revenue emerald gradient */}
				<linearGradient id={revGradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
					<stop offset="85%" stopColor="#10b981" stopOpacity="0.02" />
					<stop offset="100%" stopColor="#10b981" stopOpacity="0" />
				</linearGradient>

				{/* Users indigo gradient */}
				<linearGradient id={userGradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
					<stop offset="85%" stopColor="#6366f1" stopOpacity="0.02" />
					<stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/* Horizontal Grid lines & Dual Y-Axis ticks */}
			{revScaleInfo.ticks.map((revTick, index) => {
				const y = revScaleInfo.scale(revTick);
				const userTick =
					userScaleInfo.ticks[index] ??
					userScaleInfo.ticks[userScaleInfo.ticks.length - 1];

				return (
					<g key={`grid-tick-${revTick}`}>
						<line
							x1={PADDING_LEFT}
							y1={y}
							x2={SVG_WIDTH - PADDING_RIGHT}
							y2={y}
							stroke="#23252a"
							strokeDasharray="4 4"
							strokeWidth="1"
						/>
						{/* Left Y Label: Revenue */}
						<text
							x={PADDING_LEFT - 12}
							y={y + 4}
							textAnchor="end"
							className="fill-fog text-[11px] font-mono select-none"
						>
							{streamerActive ? "••••" : formatCompactCurrency(revTick)}
						</text>
						{/* Right Y Label: Users */}
						<text
							x={SVG_WIDTH - PADDING_RIGHT + 12}
							y={y + 4}
							textAnchor="start"
							className="fill-fog text-[11px] font-mono select-none"
						>
							{userTick}
						</text>
					</g>
				);
			})}

			{/* X-Axis Date Labels */}
			{currentData.map((item, i) => {
				const x = getX(i);
				const isLast = i === pointCount - 1;
				const isStep = i % step === 0;
				const showLabel =
					isLast || (isStep && pointCount - 1 - i >= step * 0.6);

				if (!showLabel) return null;

				return (
					<g key={`date-label-${item.date}-${item.label}-${x}`}>
						<line
							x1={x}
							y1={baselineY}
							x2={x}
							y2={baselineY + 5}
							stroke="#34383f"
							strokeWidth="1"
						/>
						<text
							x={x}
							y={baselineY + 20}
							textAnchor="middle"
							className="fill-fog text-[11px] font-mono select-none"
						>
							{item.label}
						</text>
					</g>
				);
			})}

			{/* Bottom Baseline axis line */}
			<line
				x1={PADDING_LEFT}
				y1={baselineY}
				x2={SVG_WIDTH - PADDING_RIGHT}
				y2={baselineY}
				stroke="#34383f"
				strokeWidth="1"
			/>

			{/* Shaded Area Fills */}
			{userArea && (
				<path
					d={userArea}
					fill={`url(#${userGradId})`}
					className="pointer-events-none transition-all duration-300"
				/>
			)}
			{!streamerActive && revArea && (
				<path
					d={revArea}
					fill={`url(#${revGradId})`}
					className="pointer-events-none transition-all duration-300"
				/>
			)}

			{/* Spline Curves */}
			{userSpline && (
				<path
					d={userSpline}
					fill="none"
					stroke="#6366f1"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="pointer-events-none transition-all duration-300"
				/>
			)}
			{!streamerActive && revSpline && (
				<path
					d={revSpline}
					fill="none"
					stroke="#10b981"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="pointer-events-none transition-all duration-300"
				/>
			)}

			{/* Active Hover Crosshair & Indicators */}
			{hoveredX !== null && hoveredRevY !== null && hoveredUserY !== null && (
				<g className="pointer-events-none">
					{/* Vertical Crosshair Line */}
					<line
						x1={hoveredX}
						y1={PADDING_TOP}
						x2={hoveredX}
						y2={baselineY}
						stroke="#8a8f98"
						strokeDasharray="3 3"
						strokeWidth="1.5"
						opacity="0.6"
					/>

					{/* Revenue Indicator Dots */}
					{!streamerActive && (
						<>
							<circle
								cx={hoveredX}
								cy={hoveredRevY}
								r="8"
								fill="#10b981"
								fillOpacity="0.25"
							/>
							<circle
								cx={hoveredX}
								cy={hoveredRevY}
								r="4.5"
								fill="#10b981"
								stroke="#0f1011"
								strokeWidth="2"
							/>
						</>
					)}

					{/* Users Indicator Dots */}
					<circle
						cx={hoveredX}
						cy={hoveredUserY}
						r="8"
						fill="#6366f1"
						fillOpacity="0.25"
					/>
					<circle
						cx={hoveredX}
						cy={hoveredUserY}
						r="4"
						fill="#6366f1"
						stroke="#0f1011"
						strokeWidth="2"
					/>
				</g>
			)}
		</svg>
	);
}
