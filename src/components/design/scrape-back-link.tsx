"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { MouseEvent } from "react";
import { resolveScrapeReturnPath } from "@/lib/scrape-return-path";

export function ScrapeBackLink({ from }: { from?: unknown }) {
	const router = useRouter();
	const target = resolveScrapeReturnPath(from);
	const canGoBack = router.history.canGoBack();

	function handleClick(event: MouseEvent<HTMLAnchorElement>) {
		if (!canGoBack) return;
		event.preventDefault();
		router.history.back();
	}

	return (
		<Link
			to={target}
			onClick={handleClick}
			className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
		>
			<ArrowLeft size={16} aria-hidden />
			Kembali
		</Link>
	);
}
