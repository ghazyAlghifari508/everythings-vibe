import { Alert02Icon, Loading01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { PreviewFrameReport } from "@/features/scrape/utils/preview-readiness";

export type FrameReport = PreviewFrameReport;

export const READINESS_MESSAGE: Record<
	FrameReport,
	{ label: string; tone: "pending" | "ok" | "warn"; detail: string }
> = {
	failed: {
		label: "Preview gagal ditampilkan",
		tone: "warn",
		detail:
			"Tampilan website tidak berhasil dimuat. Coba lagi atau buka Source HTML.",
	},
	preparing: {
		label: "Menyiapkan preview website",
		tone: "pending",
		detail: "Memuat tampilan halaman.",
	},
	ready: {
		label: "Preview siap dimuat",
		tone: "ok",
		detail: "Dokumen dan resource website berhasil dimuat.",
	},
	empty: {
		label: "Preview tidak berisi konten",
		tone: "warn",
		detail:
			"Halaman ini tidak menampilkan teks, media, atau latar yang bisa ditampilkan.",
	},
	degraded: {
		label: "Preview dimuat sebagian",
		tone: "warn",
		detail: "Sebagian aset halaman gagal dimuat, tampilan bisa tidak lengkap.",
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
	if (report === "ready") return null;
	if (report === "degraded") {
		return (
			<div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border border-graphite bg-obsidian/95 px-2.5 py-1.5 text-xs">
				<Icon
					icon={Alert02Icon}
					size={14}
					aria-hidden
					className="shrink-0 text-amber-400"
				/>
				<output className="truncate font-semibold text-snow">
					{label}
					<span className="font-normal text-fog"> {detail}</span>
				</output>
			</div>
		);
	}
	if (report === "preparing") {
		return (
			<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center">
				<Icon
					icon={Loading01Icon}
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
					className="rounded-md border border-graphite px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			) : null}
		</div>
	);
}
