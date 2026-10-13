"use client";

import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
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
	retryAfterExpiresAt?: string | null;
	retryAfterRemaining?: number | null;
	className?: string;
}

function remainingNow(expiresAt: string | null | undefined): number | null {
	if (!expiresAt) return null;
	const target = Date.parse(expiresAt);
	if (!Number.isFinite(target)) return null;
	return Math.max(0, Math.ceil((target - Date.now()) / 1000));
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
	retryAfterExpiresAt,
	retryAfterRemaining,
	className,
}: ScrapeErrorCardProps) {
	const showRetry = retryable && onRetry !== undefined;
	const [remaining, setRemaining] = useState<number | null>(
		remainingNow(retryAfterExpiresAt ?? null) ??
			(typeof retryAfterRemaining === "number" ? retryAfterRemaining : null),
	);
	useEffect(() => {
		if (!retryAfterExpiresAt) return;
		const id = setInterval(() => {
			setRemaining(remainingNow(retryAfterExpiresAt));
		}, 1000);
		return () => clearInterval(id);
	}, [retryAfterExpiresAt]);
	const cooldownActive =
		typeof remaining === "number" &&
		remaining > 0 &&
		typeof retryAfterExpiresAt === "string" &&
		retryAfterExpiresAt.length > 0;
	const retryDisabled = Boolean(isRetrying) || cooldownActive;
	return (
		<div className={cn("min-w-0", className)}>
			<p role="alert" className="flex items-start gap-2 text-sm text-snow">
				<AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
				<span className="font-semibold">{title}</span>
			</p>
			<p className="mt-2 text-sm leading-6 text-fog">{guidance}</p>
			<p className="mt-3 text-sm font-semibold text-snow">
				Apa yang bisa dilakukan?
			</p>
			<p className="mt-1 text-sm leading-6 text-fog">
				{retryHint ??
					(showRetry
						? "Tunggu sebelum mencoba kembali atau gunakan URL lain yang mengizinkan pengambilan konten."
						: "Tunggu sebelum mencoba kembali atau gunakan URL lain yang mengizinkan pengambilan konten.")}
			</p>
			{cooldownActive ? (
				<p className="mt-2 font-mono text-xs text-fog tabular-nums">
					Sisa waktu tunggu: {remaining} detik.
				</p>
			) : null}
			<p className="mt-2 text-sm text-fog">
				{partialResults
					? `${partialResults} hasil tersimpan tetap tersedia di bawah.`
					: "Belum ada hasil yang berhasil disimpan."}
			</p>
			<div className="mt-5 flex flex-wrap items-center gap-3">
				{showRetry ? (
					<button
						type="button"
						disabled={retryDisabled}
						onClick={onRetry}
						aria-disabled={retryDisabled}
						className="inline-flex min-h-11 items-center gap-2 rounded-full border border-graphite px-4 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
					>
						<RotateCcw size={16} aria-hidden />
						{isRetrying
							? "Mengantrekan ulang"
							: cooldownActive
								? "Coba lagi — belum tersedia"
								: "Coba lagi jika tersedia"}
					</button>
				) : null}
				<Link
					to={SCRAPE_RETURN_FALLBACK}
					className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-fog transition-colors hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Gunakan URL lain
				</Link>
			</div>
			{technicalDetail ? (
				<details className="mt-4 text-sm text-fog">
					<summary className="cursor-pointer font-mono text-xs focus-visible:ring-2 focus-visible:ring-indigo">
						Detail teknis
					</summary>
					<p className="mt-2 font-mono text-xs">{technicalDetail}</p>
				</details>
			) : null}
		</div>
	);
}
