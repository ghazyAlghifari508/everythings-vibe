"use client";

import { Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ScrapeMode } from "@/db/schema";
import type { ScrapePartialResult } from "@/features/scrape/utils/scrape-error-presentation";
import { SCRAPE_RETURN_FALLBACK } from "@/features/scrape/utils/scrape-return-path";
import { cn } from "@/lib/utils";

// Anchor id owned by the detail route. Kept here so the failure card and the
// results section cannot drift apart.
export const SCRAPE_RESULTS_ANCHOR_ID = "scrape-results";

export interface ScrapeErrorCardProps {
	title: string;
	guidance: string;
	retryable: boolean;
	retryHint?: string | null;
	technicalDetail?: string | null;
	partial?: ScrapePartialResult | null;
	mode?: ScrapeMode | null;
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
	partial,
	mode,
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
	// The secondary action must open the form that matches the failing mode,
	// otherwise an images failure sends the user to the DESIGN.md form.
	const workspaceSearch = mode ? { mode } : undefined;
	return (
		<div className={cn("min-w-0", className)}>
			<p role="alert" className="flex items-start gap-2 text-sm text-snow">
				<Icon
					icon={Alert02Icon}
					size={16}
					aria-hidden
					className="mt-0.5 shrink-0"
				/>
				<span className="font-semibold">{partial ? partial.title : title}</span>
			</p>
			<p className="mt-2 text-sm leading-6 text-fog">{guidance}</p>
			{partial ? (
				<div className="mt-3 border-t border-graphite pt-3">
					<dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
						<div>
							<dt className="sr-only">Hasil tersedia</dt>
							<dd className="font-mono text-snow tabular-nums">
								{partial.availableLabel}
							</dd>
						</div>
						{partial.failedLabel ? (
							<div>
								<dt className="sr-only">Kegagalan</dt>
								<dd className="font-mono text-fog tabular-nums">
									{partial.failedLabel}
								</dd>
							</div>
						) : null}
					</dl>
				</div>
			) : null}
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
					Coba lagi tersedia dalam {remaining} detik.
				</p>
			) : null}
			<div className="mt-5 flex flex-wrap items-center gap-3">
				{showRetry ? (
					<button
						type="button"
						disabled={retryDisabled}
						onClick={onRetry}
						aria-disabled={retryDisabled}
						title={
							cooldownActive
								? `Coba lagi tersedia dalam ${remaining} detik`
								: undefined
						}
						className="inline-flex min-h-11 items-center gap-2 rounded-full border border-graphite px-4 text-sm text-snow transition-colors hover:border-steel hover:bg-onyx focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-graphite disabled:hover:bg-transparent"
					>
						<Icon
							icon={RefreshIcon}
							size={16}
							aria-hidden
							className={isRetrying ? "motion-safe:animate-spin" : undefined}
						/>
						{isRetrying ? "Mencoba lagi..." : "Coba lagi"}
					</button>
				) : null}
				{partial ? (
					<button
						type="button"
						onClick={() =>
							document
								.getElementById(SCRAPE_RESULTS_ANCHOR_ID)
								?.scrollIntoView({ behavior: "smooth", block: "start" })
						}
						className="inline-flex min-h-11 items-center rounded-full border border-graphite px-4 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{partial.actionLabel}
					</button>
				) : null}
				<Link
					to={SCRAPE_RETURN_FALLBACK}
					search={workspaceSearch}
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
