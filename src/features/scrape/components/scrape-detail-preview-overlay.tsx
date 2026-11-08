import {
	Alert02Icon,
	Loading02Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { PreviewFrameReport } from "@/features/scrape/utils/preview-readiness";

export type FrameReport = PreviewFrameReport;

export const READINESS_MESSAGE: Record<
	FrameReport,
	{ label: string; tone: "pending" | "ok" | "warn"; detail: string }
> = {
	failed: {
		label: "Preview interaktif gagal dimuat",
		tone: "warn",
		detail:
			"Dokumen hasil scrape tidak melaporkan tampilannya. Coba lagi, atau baca isi lengkapnya di tab HTML Source.",
	},
	preparing: {
		label: "Menyiapkan preview website",
		tone: "pending",
		detail: "Memuat tampilan halaman.",
	},
	ready: {
		label: "Preview siap dimuat",
		tone: "ok",
		detail: "Dokumen dan konten website berhasil dimuat.",
	},
	empty: {
		label: "Preview tidak berisi konten",
		tone: "warn",
		detail:
			"Halaman ini tidak menampilkan teks, media, atau latar yang bisa ditampilkan.",
	},
	degraded: {
		label: "Sebagian tampilan belum termuat",
		tone: "warn",
		detail:
			"Beberapa gambar atau elemen mungkin tidak tampil seperti website aslinya.",
	},
};

/**
 * Canvas overlay for the framed preview.
 *
 * It only reports what the captured document is doing right now. Choosing what
 * to show when the document fails belongs to the preview panel, which is the
 * only layer that knows whether a screenshot is available as an alternative.
 */
export function PreviewCanvasOverlay({
	report,
	onRetry,
}: {
	report: FrameReport;
	onRetry?: () => void;
}) {
	const { label, detail } = READINESS_MESSAGE[report];
	if (report === "ready" || report === "degraded") return null;
	if (report === "preparing") {
		return (
			<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center">
				<Icon
					icon={Loading02Icon}
					size={20}
					aria-hidden
					className="text-fog motion-safe:animate-spin motion-reduce:animate-none"
				/>
				<output className="text-sm font-semibold text-snow">{label}</output>
				<p className="max-w-md text-xs leading-5 text-fog">{detail}</p>
			</div>
		);
	}
	return (
		<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center">
			<Icon
				icon={Alert02Icon}
				size={20}
				aria-hidden
				className="text-amber-400"
			/>
			<output className="text-sm font-semibold text-snow">{label}</output>
			<p className="max-w-md text-xs leading-5 text-fog">{detail}</p>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-3 py-2 text-sm text-snow transition-colors hover:border-steel hover:bg-charcoal focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={RefreshIcon} size={15} aria-hidden />
					Coba lagi
				</button>
			) : null}
		</div>
	);
}

/**
 * Footer notice for a rendered preview whose external resources partially failed.
 * Sits below the preview viewport instead of obscuring page content.
 */
export function PreviewDegradedNotice({ onRetry }: { onRetry?: () => void }) {
	const { label, detail } = READINESS_MESSAGE.degraded;
	return (
		<div
			data-testid="scrape-preview-degraded-warning"
			className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-graphite bg-obsidian/95 px-3 py-2 text-xs backdrop-blur-sm"
		>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<Icon
					icon={Alert02Icon}
					size={14}
					aria-hidden
					className="shrink-0 text-amber-400"
				/>
				<output className="min-w-0 flex-1 truncate font-semibold text-snow">
					{label}
					<span className="font-normal text-fog"> · {detail}</span>
				</output>
			</div>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					aria-label="Coba lagi memuat preview interaktif"
					className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1 font-semibold text-snow transition-colors hover:border-steel hover:bg-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={RefreshIcon} size={13} aria-hidden />
					Coba lagi
				</button>
			) : null}
		</div>
	);
}
