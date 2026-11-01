import type { StudioThemeTokens } from "@/features/studio/services/studio-presets";

interface StudioThemeDashboardPreviewProps {
	tokens: StudioThemeTokens;
}

// Unified miniature dashboard silhouette: identical geometry and content hierarchy across all presets.
// Only semantic tokens (colors, font, border radius) vary between themes.
export function StudioThemeDashboardPreview({
	tokens,
}: StudioThemeDashboardPreviewProps) {
	const radiusNum = Number.parseInt(tokens.radius, 10) || 8;
	const scaledRadius = `${Math.max(2, Math.round(radiusNum * 0.4))}px`;
	const miniRadius = `${Math.max(1, Math.round(radiusNum * 0.25))}px`;

	return (
		<div
			className="relative aspect-[16/10] w-full overflow-hidden select-none border flex flex-col text-left"
			style={{
				backgroundColor: tokens.canvas,
				borderColor: tokens.border,
				fontFamily: tokens.fontFamily,
				borderRadius: scaledRadius,
			}}
			aria-hidden="true"
		>
			{/* Top Header: [S] Dashboard ... Search [U] */}
			<div
				className="flex h-6 sm:h-7 items-center justify-between border-b px-2 shrink-0"
				style={{
					backgroundColor: tokens.surface,
					borderColor: tokens.border,
				}}
			>
				<div className="flex items-center gap-1.5">
					<span
						className="size-3 sm:size-3.5 flex items-center justify-center font-bold text-[6px] sm:text-[7px]"
						style={{
							backgroundColor: tokens.primary,
							color: tokens.primaryForeground,
							borderRadius: miniRadius,
						}}
					>
						S
					</span>
					<span
						className="text-[8px] sm:text-[9px] font-semibold tracking-tight"
						style={{ color: tokens.ink }}
					>
						Dashboard
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					<div
						className="flex h-3.5 sm:h-4 items-center gap-1 px-1.5 border"
						style={{
							backgroundColor: tokens.inputBg,
							borderColor: tokens.border,
							borderRadius: miniRadius,
						}}
					>
						<span
							className="size-1 rounded-full"
							style={{ backgroundColor: tokens.muted }}
						/>
						<span
							className="text-[6px] sm:text-[7px]"
							style={{ color: tokens.muted }}
						>
							Search
						</span>
					</div>
					<span
						className="size-3.5 sm:size-4 rounded-full border flex items-center justify-center font-medium text-[6px]"
						style={{
							backgroundColor: tokens.secondary,
							borderColor: tokens.border,
							color: tokens.secondaryForeground,
						}}
					>
						U
					</span>
				</div>
			</div>

			{/* Main body: Sidebar + Dashboard Content */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Sidebar (NAV) */}
				<div
					className="w-14 sm:w-16 border-r flex flex-col justify-between p-1.5 shrink-0"
					style={{
						backgroundColor: tokens.surface,
						borderColor: tokens.border,
					}}
				>
					<div className="flex flex-col gap-1">
						{/* Active Nav item */}
						<div
							className="flex items-center gap-1 px-1 py-0.5 border"
							style={{
								backgroundColor: tokens.active,
								borderColor: tokens.border,
								borderRadius: miniRadius,
							}}
						>
							<span
								className="size-1 rounded-full"
								style={{ backgroundColor: tokens.primary }}
							/>
							<span
								className="text-[6px] sm:text-[7px] font-semibold truncate"
								style={{ color: tokens.primary }}
							>
								Overview
							</span>
						</div>
						{/* Secondary Nav items */}
						<div className="flex items-center gap-1 px-1 py-0.5">
							<span
								className="size-1 rounded-full opacity-60"
								style={{ backgroundColor: tokens.muted }}
							/>
							<span
								className="text-[6px] sm:text-[7px] truncate"
								style={{ color: tokens.muted }}
							>
								Reports
							</span>
						</div>
						<div className="flex items-center gap-1 px-1 py-0.5">
							<span
								className="size-1 rounded-full opacity-60"
								style={{ backgroundColor: tokens.muted }}
							/>
							<span
								className="text-[6px] sm:text-[7px] truncate"
								style={{ color: tokens.muted }}
							>
								Activity
							</span>
						</div>
					</div>

					{/* Bottom sidebar item */}
					<div className="flex items-center gap-1 px-1 py-0.5">
						<span
							className="size-1 rounded-full opacity-50"
							style={{ backgroundColor: tokens.muted }}
						/>
						<span
							className="text-[5.5px] truncate"
							style={{ color: tokens.muted }}
						>
							Settings
						</span>
					</div>
				</div>

				{/* Content area */}
				<div
					className="flex flex-1 flex-col justify-between p-1.5 sm:p-2 overflow-hidden gap-1"
					style={{ backgroundColor: tokens.canvas }}
				>
					{/* Metric 1 & Metric 2 */}
					<div className="grid grid-cols-2 gap-1.5 shrink-0">
						<div
							className="flex flex-col justify-between p-1 border"
							style={{
								backgroundColor: tokens.surface,
								borderColor: tokens.border,
								borderRadius: scaledRadius,
							}}
						>
							<span
								className="text-[6px] font-medium leading-none"
								style={{ color: tokens.muted }}
							>
								Revenue
							</span>
							<div className="flex items-baseline justify-between mt-0.5">
								<span
									className="text-[7.5px] sm:text-[8px] font-bold leading-none"
									style={{ color: tokens.ink }}
								>
									$24.8k
								</span>
								<span
									className="text-[5px] px-0.5 rounded-xs font-semibold leading-none"
									style={{
										backgroundColor: tokens.active,
										color: tokens.primary,
									}}
								>
									+12%
								</span>
							</div>
						</div>

						<div
							className="flex flex-col justify-between p-1 border"
							style={{
								backgroundColor: tokens.surface,
								borderColor: tokens.border,
								borderRadius: scaledRadius,
							}}
						>
							<span
								className="text-[6px] font-medium leading-none"
								style={{ color: tokens.muted }}
							>
								Active Users
							</span>
							<div className="flex items-baseline justify-between mt-0.5">
								<span
									className="text-[7.5px] sm:text-[8px] font-bold leading-none"
									style={{ color: tokens.ink }}
								>
									1,429
								</span>
								<span
									className="text-[5px] px-0.5 rounded-xs font-semibold leading-none"
									style={{
										backgroundColor: tokens.secondary,
										color: tokens.secondaryForeground,
									}}
								>
									+5%
								</span>
							</div>
						</div>
					</div>

					{/* Chart Container */}
					<div
						className="flex flex-col p-1 border min-h-0 flex-1 justify-between"
						style={{
							backgroundColor: tokens.surface,
							borderColor: tokens.border,
							borderRadius: scaledRadius,
						}}
					>
						<div className="flex items-center justify-between pb-0.5">
							<span
								className="text-[5.5px] sm:text-[6px] font-medium"
								style={{ color: tokens.muted }}
							>
								Growth Trend
							</span>
							<span
								className="size-1 rounded-full"
								style={{ backgroundColor: tokens.primary }}
							/>
						</div>
						<div className="h-5 sm:h-6 w-full flex items-end">
							<svg
								viewBox="0 0 100 24"
								className="w-full h-full overflow-visible"
								preserveAspectRatio="none"
							>
								<title>Visual metric trend</title>
								<path
									d="M0,20 L12,15 L25,18 L38,10 L52,13 L66,6 L80,9 L92,3 L100,2 L100,24 L0,24 Z"
									fill={tokens.primary}
									fillOpacity="0.12"
								/>
								<path
									d="M0,20 L12,15 L25,18 L38,10 L52,13 L66,6 L80,9 L92,3 L100,2"
									fill="none"
									stroke={tokens.primary}
									strokeWidth="1.75"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</div>
					</div>

					{/* Recent Activity Table */}
					<div
						className="flex flex-col p-1 border shrink-0"
						style={{
							backgroundColor: tokens.surface,
							borderColor: tokens.border,
							borderRadius: scaledRadius,
						}}
					>
						<div
							className="flex items-center justify-between pb-0.5 border-b"
							style={{ borderColor: tokens.border }}
						>
							<span
								className="text-[5.5px] sm:text-[6px] font-semibold"
								style={{ color: tokens.ink }}
							>
								Recent Activity
							</span>
							<span className="text-[5px]" style={{ color: tokens.muted }}>
								Status
							</span>
						</div>

						{/* Row 1 */}
						<div
							className="flex items-center justify-between py-0.5 border-b"
							style={{ borderColor: tokens.border }}
						>
							<div className="flex items-center gap-1">
								<span
									className="size-1 rounded-full"
									style={{ backgroundColor: tokens.primary }}
								/>
								<span
									className="text-[5.5px] truncate"
									style={{ color: tokens.ink }}
								>
									Batch #428 synced
								</span>
							</div>
							<span
								className="text-[5px] px-1 font-semibold rounded-xs"
								style={{
									backgroundColor: tokens.active,
									color: tokens.primary,
								}}
							>
								Done
							</span>
						</div>

						{/* Row 2 */}
						<div className="flex items-center justify-between pt-0.5">
							<div className="flex items-center gap-1">
								<span
									className="size-1 rounded-full opacity-60"
									style={{ backgroundColor: tokens.muted }}
								/>
								<span
									className="text-[5.5px] truncate"
									style={{ color: tokens.muted }}
								>
									API webhook ping
								</span>
							</div>
							<span className="text-[5px]" style={{ color: tokens.muted }}>
								1m ago
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
