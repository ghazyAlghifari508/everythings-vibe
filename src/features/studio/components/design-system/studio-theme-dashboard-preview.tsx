import type { StudioThemeTokens } from "@/features/studio/services/studio-presets";

interface StudioThemeDashboardPreviewProps {
	tokens: StudioThemeTokens;
}

/**
 * Unified abstract UI silhouette: identical geometry and content hierarchy across all presets.
 * Only semantic tokens (colors, font, border radius) vary between themes.
 * Eliminates fake dashboard copy, micro-text, and simulated metrics.
 */
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
			{/* Top Header silhouette: [■] [=========] ... [===] [○] */}
			<div
				className="flex h-6 sm:h-7 items-center justify-between border-b px-2 shrink-0"
				style={{
					backgroundColor: tokens.surface,
					borderColor: tokens.border,
				}}
			>
				<div className="flex items-center gap-1.5">
					{/* Logo block [■] */}
					<span
						className="size-3 sm:size-3.5 shrink-0 block"
						style={{
							backgroundColor: tokens.primary,
							borderRadius: miniRadius,
						}}
					/>
					{/* Header bar silhouette [=========] */}
					<span
						className="h-2 w-16 sm:w-20 block opacity-85"
						style={{
							backgroundColor: tokens.ink,
							borderRadius: miniRadius,
						}}
					/>
				</div>

				<div className="flex items-center gap-1.5">
					{/* Search/input silhouette */}
					<span
						className="h-3 sm:h-3.5 w-12 sm:w-16 border block"
						style={{
							backgroundColor: tokens.inputBg,
							borderColor: tokens.border,
							borderRadius: miniRadius,
						}}
					/>
					{/* Avatar silhouette [○] */}
					<span
						className="size-3.5 sm:size-4 rounded-full border shrink-0 block"
						style={{
							backgroundColor: tokens.secondary,
							borderColor: tokens.border,
						}}
					/>
				</div>
			</div>

			{/* Main body: Sidebar + Content Region */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Sidebar silhouette */}
				<div
					className="w-14 sm:w-16 border-r flex flex-col justify-between p-1.5 shrink-0"
					style={{
						backgroundColor: tokens.surface,
						borderColor: tokens.border,
					}}
				>
					{/* Navigation items silhouette */}
					<div className="flex flex-col gap-1">
						{/* Active item */}
						<div
							className="flex items-center gap-1 px-1 py-1 border"
							style={{
								backgroundColor: tokens.active,
								borderColor: tokens.border,
								borderRadius: miniRadius,
							}}
						>
							<span
								className="size-1 rounded-full shrink-0"
								style={{ backgroundColor: tokens.primary }}
							/>
							<span
								className="h-1.5 w-7 sm:w-8 block"
								style={{
									backgroundColor: tokens.primary,
									borderRadius: miniRadius,
								}}
							/>
						</div>
						{/* Inactive item 1 */}
						<div className="flex items-center gap-1 px-1 py-0.5">
							<span
								className="size-1 rounded-full shrink-0 opacity-40"
								style={{ backgroundColor: tokens.muted }}
							/>
							<span
								className="h-1.5 w-8 sm:w-9 block opacity-40"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: miniRadius,
								}}
							/>
						</div>
						{/* Inactive item 2 */}
						<div className="flex items-center gap-1 px-1 py-0.5">
							<span
								className="size-1 rounded-full shrink-0 opacity-40"
								style={{ backgroundColor: tokens.muted }}
							/>
							<span
								className="h-1.5 w-6 sm:w-7 block opacity-40"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: miniRadius,
								}}
							/>
						</div>
					</div>

					{/* Bottom sidebar item */}
					<div className="flex items-center gap-1 px-1 py-0.5">
						<span
							className="size-1 rounded-full shrink-0 opacity-30"
							style={{ backgroundColor: tokens.muted }}
						/>
						<span
							className="h-1.5 w-5 sm:w-6 block opacity-30"
							style={{
								backgroundColor: tokens.muted,
								borderRadius: miniRadius,
							}}
						/>
					</div>
				</div>

				{/* Content region */}
				<div
					className="flex flex-1 flex-col justify-between p-1.5 sm:p-2 overflow-hidden gap-1.5"
					style={{ backgroundColor: tokens.canvas }}
				>
					{/* Top row: 2 panel silhouettes */}
					<div className="grid grid-cols-2 gap-1.5 shrink-0">
						{/* Panel 1 */}
						<div
							className="flex flex-col justify-between p-1.5 border"
							style={{
								backgroundColor: tokens.surface,
								borderColor: tokens.border,
								borderRadius: scaledRadius,
							}}
						>
							<span
								className="h-1.5 w-10 block opacity-50"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: miniRadius,
								}}
							/>
							<div className="flex items-center justify-between mt-1">
								<span
									className="h-2.5 sm:h-3 w-12 sm:w-14 block"
									style={{
										backgroundColor: tokens.ink,
										borderRadius: miniRadius,
									}}
								/>
								<span
									className="h-2 w-5 sm:w-6 block"
									style={{
										backgroundColor: tokens.active,
										borderRadius: miniRadius,
									}}
								/>
							</div>
						</div>

						{/* Panel 2 */}
						<div
							className="flex flex-col justify-between p-1.5 border"
							style={{
								backgroundColor: tokens.surface,
								borderColor: tokens.border,
								borderRadius: scaledRadius,
							}}
						>
							<span
								className="h-1.5 w-9 block opacity-50"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: miniRadius,
								}}
							/>
							<div className="flex items-center justify-between mt-1">
								<span
									className="h-2.5 sm:h-3 w-10 sm:w-12 block"
									style={{
										backgroundColor: tokens.ink,
										borderRadius: miniRadius,
									}}
								/>
								<span
									className="h-2 w-4 sm:w-5 block"
									style={{
										backgroundColor: tokens.secondary,
										borderRadius: miniRadius,
									}}
								/>
							</div>
						</div>
					</div>

					{/* Middle row: Chart / graphic placeholder panel */}
					<div
						className="flex flex-col p-1.5 border min-h-0 flex-1 justify-between"
						style={{
							backgroundColor: tokens.surface,
							borderColor: tokens.border,
							borderRadius: scaledRadius,
						}}
					>
						<div className="flex items-center justify-between pb-1">
							<span
								className="h-1.5 w-14 sm:w-16 block opacity-60"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: miniRadius,
								}}
							/>
							<span
								className="size-1 rounded-full shrink-0"
								style={{ backgroundColor: tokens.primary }}
							/>
						</div>
						<div className="h-5 sm:h-6 w-full flex items-end">
							<svg
								viewBox="0 0 100 24"
								className="w-full h-full overflow-visible"
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								<title>Placeholder grafik siluet</title>
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

					{/* Bottom row: Abstract data rows */}
					<div
						className="flex flex-col p-1.5 border shrink-0 gap-1"
						style={{
							backgroundColor: tokens.surface,
							borderColor: tokens.border,
							borderRadius: scaledRadius,
						}}
					>
						{/* Data row 1 */}
						<div className="flex items-center justify-between gap-1.5">
							<div className="flex items-center gap-1.5 flex-1 min-w-0">
								<span
									className="size-1 rounded-full shrink-0"
									style={{ backgroundColor: tokens.primary }}
								/>
								<span
									className="h-1.5 flex-1 max-w-24 block opacity-75"
									style={{
										backgroundColor: tokens.ink,
										borderRadius: miniRadius,
									}}
								/>
							</div>
							<span
								className="h-1.5 w-6 sm:w-8 block"
								style={{
									backgroundColor: tokens.active,
									borderRadius: miniRadius,
								}}
							/>
						</div>

						{/* Data row 2 */}
						<div className="flex items-center justify-between gap-1.5">
							<div className="flex items-center gap-1.5 flex-1 min-w-0">
								<span
									className="size-1 rounded-full shrink-0 opacity-40"
									style={{ backgroundColor: tokens.muted }}
								/>
								<span
									className="h-1.5 flex-1 max-w-20 block opacity-40"
									style={{
										backgroundColor: tokens.muted,
										borderRadius: miniRadius,
									}}
								/>
							</div>
							<span
								className="h-1.5 w-4 sm:w-5 block opacity-40"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: miniRadius,
								}}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
