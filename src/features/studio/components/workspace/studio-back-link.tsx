"use client";

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { resolveStudioReturnPath } from "@/lib/studio-return-path";

const DEFAULT_LABEL = "Kembali";
const DEFAULT_ARIA_LABEL = "Kembali ke halaman desain";

export function StudioBackLink({
	from,
	label = DEFAULT_LABEL,
}: {
	from?: unknown;
	label?: string;
}) {
	const target = resolveStudioReturnPath(from);

	return (
		<Link
			to={target}
			replace
			aria-label={label === DEFAULT_LABEL ? DEFAULT_ARIA_LABEL : label}
			className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
		>
			<ArrowLeft size={16} aria-hidden />
			{label}
		</Link>
	);
}
