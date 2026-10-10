"use client";

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { resolveScrapeReturnPath } from "@/lib/scrape-return-path";

export function ScrapeBackLink({ from }: { from?: unknown }) {
	const target = resolveScrapeReturnPath(from);

	return (
		<Link
			to={target}
			replace
			className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
		>
			<ArrowLeft size={16} aria-hidden />
			Kembali
		</Link>
	);
}
