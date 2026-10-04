import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export interface HubBreadcrumbAncestor {
	label: string;
	to: string;
}

export function HubBreadcrumb({
	current,
	ancestors,
}: {
	current: string;
	/** Ancestors in order, outermost first. Omit for a Home-only trail. */
	ancestors?: readonly HubBreadcrumbAncestor[];
}) {
	const linkClass =
		"rounded-sm transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";
	return (
		<nav aria-label="Breadcrumb">
			<ol className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-fog">
				<li>
					<Link to="/" className={linkClass}>
						Home
					</Link>
				</li>
				{(ancestors ?? []).map((ancestor) => (
					<li key={ancestor.to} className="flex items-center gap-1.5">
						<span aria-hidden>
							<ChevronRight size={12} />
						</span>
						<Link to={ancestor.to} className={linkClass}>
							{ancestor.label}
						</Link>
					</li>
				))}
				<li aria-hidden>
					<ChevronRight size={12} />
				</li>
				<li aria-current="page" className="text-snow">
					{current}
				</li>
			</ol>
		</nav>
	);
}
