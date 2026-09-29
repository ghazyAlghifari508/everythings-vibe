import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export interface HubBreadcrumbParent {
	label: string;
	to: string;
}

export function HubBreadcrumb({
	current,
	parent,
}: {
	current: string;
	parent?: HubBreadcrumbParent;
}) {
	return (
		<nav aria-label="Breadcrumb">
			<ol className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-fog">
				<li>
					<Link
						to="/"
						className="rounded-sm transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Home
					</Link>
				</li>
				{parent ? (
					<>
						<li aria-hidden>
							<ChevronRight size={12} />
						</li>
						<li>
							<Link
								to={parent.to}
								className="rounded-sm transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								{parent.label}
							</Link>
						</li>
					</>
				) : null}
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
