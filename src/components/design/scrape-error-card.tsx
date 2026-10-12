"use client";

import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { SCRAPE_RETURN_FALLBACK } from "@/lib/scrape-return-path";
import { cn } from "@/lib/utils";

export interface ScrapeErrorCardProps {
	title: string;
	guidance: string;
	retryable: boolean;
	retryHint?: string | null;
	technicalDetail?: string | null;
	partialResults?: number;
	isRetrying?: boolean;
	onRetry?: () => void;
	className?: string;
}

export function ScrapeErrorCard({
	title,
	guidance,
	retryable,
	retryHint,
	technicalDetail,
	partialResults,
	isRetrying,
	onRetry,
	className,
}: ScrapeErrorCardProps) {
	const showRetry = retryable && onRetry !== undefined;
	return (
		<div className={cn("min-w-0", className)}>
			<p role="alert" className="flex items-start gap-2 text-sm text-snow">
				<AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
				<span className="font-semibold">{title}</span>
			</p>
			<p className="mt-2 text-sm leading-6 text-fog">{guidance}</p>
			<p className="mt-3 text-sm font-semibold text-snow">
				Yang bisa dilakukan:
			</p>
			<p className="mt-1 text-sm leading-6 text-fog">
				{retryHint ??
					(showRetry
						? "Tunggu sebentar, lalu coba lagi."
						: "Gunakan website lain yang mengizinkan scraping.")}
			</p>
			<p className="mt-2 text-sm text-fog">
				{partialResults
					? `${partialResults} hasil tersimpan tetap tersedia di bawah.`
					: "Belum ada hasil yang berhasil disimpan."}
			</p>
			<div className="mt-5 flex flex-wrap items-center gap-3">
				{showRetry ? (
					<button
						type="button"
						disabled={isRetrying}
						onClick={onRetry}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite px-4 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
					>
						<RotateCcw size={16} aria-hidden />
						{isRetrying ? "Mengantrekan ulang" : "Coba lagi"}
					</button>
				) : null}
				<Link
					to={SCRAPE_RETURN_FALLBACK}
					className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-fog transition-colors hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
				>
					URL lain
				</Link>
			</div>
			{technicalDetail ? (
				<p className="mt-4 font-mono text-xs text-fog">{technicalDetail}</p>
			) : null}
		</div>
	);
}
