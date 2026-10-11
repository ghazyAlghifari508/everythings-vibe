export interface StudioFrameSkeletonProps {
	name: string;
	description?: string | null;
	viewport: string;
	status?: string;
	className?: string;
}

export function StudioFrameSkeleton({
	name,
	viewport,
	status = "generating",
	className = "",
}: StudioFrameSkeletonProps) {
	return (
		<output
			data-testid={viewport === "mobile" ? "mobile-skeleton" : "web-skeleton"}
			className={`studio-generating-artboard relative flex size-full flex-col items-center justify-center gap-2 overflow-hidden bg-obsidian p-8 text-center ${className}`}
		>
			<p className="text-base font-semibold text-snow">{name}</p>
			<p className="text-sm text-fog">
				{status === "queued" ? "Menunggu giliran" : "Membuat desain layar…"}
			</p>
		</output>
	);
}
