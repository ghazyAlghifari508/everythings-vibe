import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export function HubBreadcrumb({ current }: { current: string }) {
	return (
		<nav aria-label="Breadcrumb">
			<ol className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-fog">
				<li className="flex items-center gap-1">
					<ChevronRight size={12} aria-hidden className="rotate-180" />
					<Link
						to="/"
						className="rounded-sm transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Home
					</Link>
				</li>
				<li aria-current="page" className="text-snow">
					{current}
				</li>
			</ol>
		</nav>
	);
}
