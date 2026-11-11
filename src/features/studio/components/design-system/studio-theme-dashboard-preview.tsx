import type { StudioThemeTokens } from "@/features/studio/services/studio-presets";

interface StudioThemeDashboardPreviewProps {
	tokens: StudioThemeTokens;
}

const SKELETON_LINES = ["w-1/2", "w-3/4", "w-2/3"] as const;
const RAIL_ITEMS = ["w-2/3", "w-3/4", "w-1/2"] as const;

/**
 * Abstract layout silhouette shared by every preset: header, rail and a
 * two-column content region. Only semantic tokens (surface, ink, border,
 * accent, radius) change per theme, so the cards stay comparable and carry no
 * fake dashboard copy, metrics or micro-text.
 */
export function StudioThemeDashboardPreview({
	tokens,
}: StudioThemeDashboardPreviewProps) {
	const radius = Number.parseInt(tokens.radius, 10) || 8;
	const cardRadius = `${Math.max(2, Math.round(radius * 0.5))}px`;
	const barRadius = `${Math.max(1, Math.round(radius * 0.3))}px`;

	return (
		<div
			className="flex aspect-[16/10] w-full flex-col overflow-hidden border text-left select-none"
			style={{
				backgroundColor: tokens.canvas,
				borderColor: tokens.border,
				fontFamily: tokens.fontFamily,
				borderRadius: cardRadius,
			}}
			aria-hidden="true"
		>
			<div
				className="flex h-1/5 shrink-0 items-center gap-1.5 border-b px-2"
				style={{ backgroundColor: tokens.surface, borderColor: tokens.border }}
			>
				<span
					className="size-2 shrink-0"
					style={{ backgroundColor: tokens.primary, borderRadius: barRadius }}
				/>
				<span
					className="h-1.5 w-1/3"
					style={{ backgroundColor: tokens.ink, borderRadius: barRadius }}
				/>
				<span
					className="ml-auto h-2 w-1/5 border"
					style={{
						backgroundColor: tokens.inputBg,
						borderColor: tokens.border,
						borderRadius: barRadius,
					}}
				/>
			</div>

			<div className="flex min-h-0 flex-1">
				<div
					className="flex w-1/5 shrink-0 flex-col gap-1.5 border-r p-1.5"
					style={{
						backgroundColor: tokens.surface,
						borderColor: tokens.border,
					}}
				>
					{RAIL_ITEMS.map((width, index) => (
						<span
							key={width}
							className={`h-1.5 ${width}`}
							style={{
								backgroundColor: index === 0 ? tokens.primary : tokens.muted,
								borderRadius: barRadius,
								opacity: index === 0 ? 1 : 0.5,
							}}
						/>
					))}
					<span
						className="mt-auto h-1.5 w-1/2"
						style={{
							backgroundColor: tokens.muted,
							borderRadius: barRadius,
							opacity: 0.35,
						}}
					/>
				</div>

				<div
					className="flex min-w-0 flex-1 flex-col gap-1.5 p-2"
					style={{ backgroundColor: tokens.canvas }}
				>
					<div className="flex flex-col gap-1">
						{SKELETON_LINES.map((width, index) => (
							<span
								key={width}
								className={`h-1.5 ${width}`}
								style={{
									backgroundColor: index === 0 ? tokens.ink : tokens.muted,
									borderRadius: barRadius,
									opacity: index === 0 ? 1 : 0.45,
								}}
							/>
						))}
					</div>

					<div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
						<div
							className="flex flex-col justify-between border p-1.5"
							style={{
								backgroundColor: tokens.surface,
								borderColor: tokens.border,
								borderRadius: cardRadius,
							}}
						>
							<span
								className="h-1.5 w-2/3"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: barRadius,
									opacity: 0.5,
								}}
							/>
							<span
								className="h-2.5 w-1/2"
								style={{
									backgroundColor: tokens.ink,
									borderRadius: barRadius,
								}}
							/>
						</div>
						<div
							className="flex flex-col justify-between border p-1.5"
							style={{
								backgroundColor: tokens.surface,
								borderColor: tokens.border,
								borderRadius: cardRadius,
							}}
						>
							<span
								className="h-1.5 w-1/2"
								style={{
									backgroundColor: tokens.muted,
									borderRadius: barRadius,
									opacity: 0.5,
								}}
							/>
							<span
								className="h-2.5 w-2/3"
								style={{
									backgroundColor: tokens.secondary,
									borderRadius: barRadius,
								}}
							/>
						</div>
					</div>

					<div
						className="flex h-1/4 shrink-0 items-end gap-1.5 border p-1.5"
						style={{
							backgroundColor: tokens.surface,
							borderColor: tokens.border,
							borderRadius: cardRadius,
						}}
					>
						<span
							className="h-1/2 w-1/4"
							style={{
								backgroundColor: tokens.primary,
								borderRadius: barRadius,
							}}
						/>
						<span
							className="h-3/4 w-1/4"
							style={{
								backgroundColor: tokens.primary,
								borderRadius: barRadius,
								opacity: 0.7,
							}}
						/>
						<span
							className="h-full w-1/4"
							style={{
								backgroundColor: tokens.active,
								borderRadius: barRadius,
							}}
						/>
						<span
							className="h-1/3 w-1/4"
							style={{
								backgroundColor: tokens.muted,
								borderRadius: barRadius,
								opacity: 0.4,
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
