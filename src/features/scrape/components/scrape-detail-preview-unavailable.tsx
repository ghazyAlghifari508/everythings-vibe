import {
	Alert02Icon,
	Loading01Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

/**
 * Shown when no visual mode can be presented.
 *
 * The retry only appears for a real failure. The source is one click away in
 * the tab bar above, so this surface never repeats that action.
 */
export function PreviewUnavailable({
	message,
	isRetryable,
	isLoading = false,
	onRetry,
}: {
	message: string;
	isRetryable: boolean;
	isLoading?: boolean;
	onRetry?: () => void;
}) {
	return (
		<div
			data-testid="preview-unavailable"
			className="flex min-h-[280px] flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center"
		>
			{isLoading ? (
				<Icon
					icon={Loading01Icon}
					size={20}
					aria-hidden
					className="text-fog motion-safe:animate-spin motion-reduce:animate-none"
				/>
			) : (
				<Icon
					icon={Alert02Icon}
					size={20}
					aria-hidden
					className="text-amber-400"
				/>
			)}
			<output className="text-sm font-semibold text-snow">{message}</output>
			<p className="max-w-md text-xs leading-5 text-fog">
				Source HTML asli tetap tersedia di tab HTML Source.
			</p>
			<div className="mt-1 flex flex-wrap items-center justify-center gap-2">
				{isRetryable && onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:border-steel hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<Icon icon={RefreshIcon} size={14} aria-hidden />
						Coba lagi
					</button>
				) : null}
			</div>
		</div>
	);
}
