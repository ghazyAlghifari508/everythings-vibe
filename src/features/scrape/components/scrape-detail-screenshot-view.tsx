import { CodeIcon, RotateRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

export function ScreenshotView({
	screenshot,
	domain,
	onOpenSource,
	onRetry,
}: {
	screenshot: string;
	domain: string;
	onOpenSource?: () => void;
	onRetry?: () => void;
}) {
	return (
		<div className="flex flex-col" data-testid="visual-screenshot-view">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite bg-obsidian px-3 py-2 text-xs text-fog">
				<div className="flex items-center gap-2">
					<span className="rounded bg-indigo/20 px-2 py-0.5 text-[11px] font-semibold text-indigo">
						Tangkapan Layar Browser
					</span>
					<span className="text-snow">
						Referensi visual asli dari browser saat capture
					</span>
				</div>
				<div className="flex items-center gap-2">
					{onOpenSource ? (
						<button
							type="button"
							onClick={onOpenSource}
							className="inline-flex items-center gap-1 text-[11px] text-fog hover:text-snow"
						>
							<Icon icon={CodeIcon} size={13} aria-hidden />
							Lihat HTML Source
						</button>
					) : null}
					{onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							className="inline-flex items-center gap-1 text-[11px] text-fog hover:text-snow"
						>
							<Icon icon={RotateRight01Icon} size={13} aria-hidden />
							Coba lagi preview
						</button>
					) : null}
				</div>
			</div>
			<div className="flex max-h-[760px] min-h-[300px] w-full items-center justify-center overflow-auto bg-onyx p-4">
				<img
					src={screenshot}
					alt={`Tangkapan layar ${domain}`}
					data-testid="scrape-visual-screenshot"
					className="max-h-[700px] w-auto max-w-full rounded border border-graphite object-contain shadow-sm"
				/>
			</div>
		</div>
	);
}
