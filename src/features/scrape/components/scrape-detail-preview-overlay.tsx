import { AlertTriangle, Loader2 } from "lucide-react";
import type { PreviewFrameReport } from "@/features/scrape/utils/preview-readiness";
import { ScreenshotView } from "./scrape-detail-screenshot-view";

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
		detail: "Memuat tampilan dan resource halaman.",
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
			"Dokumen hasil capture tidak memuat teks, media, atau latar yang bisa ditampilkan.",
	},
	degraded: {
		label: "Preview dimuat sebagian",
		tone: "warn",
		detail:
			"Sebagian resource website gagal dimuat, tampilan bisa tidak lengkap.",
	},
};

export function PreviewCanvasOverlay({
	report,
	screenshot,
	domain,
	onRetry,
	onOpenSource,
}: {
	report: FrameReport;
	screenshot?: string | null;
	domain?: string;
	onRetry?: () => void;
	onOpenSource?: () => void;
}) {
	const { label, detail } = READINESS_MESSAGE[report];
	if (report === "ready") return null;
	if (report === "degraded") {
		return (
			<div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border border-graphite bg-obsidian/95 px-2.5 py-1.5 text-xs">
				<AlertTriangle
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
				<Loader2
					size={20}
					aria-hidden
					className="text-fog motion-safe:animate-spin motion-reduce:animate-none"
				/>
				<output className="text-sm font-semibold text-snow">{label}</output>
				<p className="max-w-md text-xs leading-5 text-fog">{detail}</p>
			</div>
		);
	}
	if (screenshot && domain) {
		return (
			<div className="absolute inset-0 z-10 flex flex-col bg-onyx">
				<ScreenshotView
					screenshot={screenshot}
					domain={domain}
					onOpenSource={onOpenSource}
					onRetry={onRetry}
				/>
			</div>
		);
	}
	return (
		<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-onyx px-6 py-12 text-center">
			<AlertTriangle size={20} aria-hidden className="text-amber-400" />
			<output className="text-sm font-semibold text-snow">{label}</output>
			<p className="max-w-md text-xs leading-5 text-fog">
				Visual preview unavailable. The website could not be shown accurately.{" "}
				{detail}
			</p>
			{onRetry ? (
				<div className="flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						onClick={onRetry}
						className="rounded-md border border-graphite px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Coba lagi
					</button>
					{onOpenSource ? (
						<button
							type="button"
							onClick={onOpenSource}
							className="rounded-md border border-graphite px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Buka Source HTML
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
