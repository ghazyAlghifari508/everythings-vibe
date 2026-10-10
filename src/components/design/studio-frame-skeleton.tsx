import type { StudioDesignMode } from "@/lib/prompts-ui-studio";

export interface StudioFrameSkeletonProps {
	name: string;
	description?: string | null;
	viewport: StudioDesignMode | string;
	className?: string;
}

export function StudioFrameSkeleton({
	name,
	description,
	viewport,
	className = "",
}: StudioFrameSkeletonProps) {
	const isMobile = viewport === "mobile";

	if (isMobile) {
		return (
			<div
				data-testid="mobile-skeleton"
				className={`flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-graphite bg-[#121214] p-4 text-snow select-none ${className}`}
				style={{ width: 375, height: 740 }}
			>
				{/* Phone Top Speaker & Camera Notch */}
				<div className="mx-auto mb-4 h-4 w-28 rounded-full bg-graphite/40 animate-pulse" />

				{/* Header / App Bar Skeleton */}
				<div className="mb-4 flex items-center justify-between">
					<div className="space-y-1">
						<span className="text-xs font-semibold text-snow">{name}</span>
						{description && (
							<p className="line-clamp-1 text-[10px] text-fog">{description}</p>
						)}
					</div>
					<div className="size-6 rounded-full bg-graphite/50 animate-pulse" />
				</div>

				{/* Hero Metric Card Skeleton */}
				<div className="mb-4 h-28 rounded-xl border border-graphite/40 bg-onyx/80 p-3 flex flex-col justify-between animate-pulse">
					<div className="h-3 w-24 rounded bg-graphite/60" />
					<div className="h-6 w-36 rounded bg-graphite/80" />
					<div className="flex gap-2">
						<div className="h-2 w-16 rounded bg-graphite/40" />
						<div className="h-2 w-12 rounded bg-graphite/40" />
					</div>
				</div>

				{/* Content List Items Skeleton */}
				<div className="flex-1 space-y-2.5 overflow-hidden">
					<div className="h-3 w-20 rounded bg-graphite/50 mb-2" />
					{[1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="flex items-center justify-between rounded-lg border border-graphite/30 bg-charcoal/50 p-2.5 animate-pulse"
						>
							<div className="flex items-center gap-2.5">
								<div className="size-8 rounded-md bg-graphite/50" />
								<div className="space-y-1">
									<div className="h-3 w-24 rounded bg-graphite/60" />
									<div className="h-2 w-16 rounded bg-graphite/40" />
								</div>
							</div>
							<div className="h-3 w-12 rounded bg-graphite/50" />
						</div>
					))}
				</div>

				{/* Sticky Bottom Navigation Skeleton */}
				<div className="mt-auto flex items-center justify-around border-t border-graphite/50 pt-2.5">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="flex flex-col items-center gap-1">
							<div className="size-4 rounded-sm bg-graphite/60" />
							<div className="h-1.5 w-6 rounded bg-graphite/40" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div
			data-testid="web-skeleton"
			className={`flex h-full w-full flex-col overflow-hidden rounded-xl border border-graphite bg-[#121214] text-snow select-none ${className}`}
			style={{ width: 1200, height: 750 }}
		>
			{/* Desktop Top Navbar Skeleton */}
			<div className="flex h-12 items-center justify-between border-b border-graphite/60 bg-onyx px-5">
				<div className="flex items-center gap-4">
					<div className="h-5 w-24 rounded bg-graphite/80" />
					<div className="flex gap-3">
						<div className="h-3 w-16 rounded bg-graphite/50" />
						<div className="h-3 w-16 rounded bg-graphite/50" />
						<div className="h-3 w-16 rounded bg-graphite/50" />
					</div>
				</div>
				<div className="flex items-center gap-2.5">
					<div className="h-7 w-20 rounded-md bg-graphite/40" />
					<div className="size-7 rounded-full bg-graphite/60" />
				</div>
			</div>

			{/* Desktop Body Bento Grid Skeleton */}
			<div className="flex flex-1 p-5 gap-5">
				{/* Main area */}
				<div className="flex-1 space-y-4">
					<div className="flex items-center justify-between">
						<div>
							<span className="text-sm font-semibold text-snow">{name}</span>
							{description && <p className="text-xs text-fog">{description}</p>}
						</div>
						<div className="h-6 w-24 rounded bg-graphite/40" />
					</div>
					{/* Stat Cards */}
					<div className="grid grid-cols-3 gap-4">
						{[1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-20 rounded-lg border border-graphite/40 bg-onyx/70 p-3 flex flex-col justify-between animate-pulse"
							>
								<div className="h-3 w-16 rounded bg-graphite/50" />
								<div className="h-5 w-24 rounded bg-graphite/70" />
							</div>
						))}
					</div>
					{/* Big Table/Chart Skeleton */}
					<div className="h-72 rounded-lg border border-graphite/40 bg-onyx/60 p-4 space-y-3 animate-pulse">
						<div className="h-4 w-32 rounded bg-graphite/60" />
						{[1, 2, 3, 4, 5].map((row) => (
							<div key={row} className="h-7 w-full rounded bg-graphite/30" />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
