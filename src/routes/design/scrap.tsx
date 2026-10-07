import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";

export const Route = createFileRoute("/design/scrap")({
	component: ScrapLayout,
});

function ScrapLayout() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<HubBreadcrumb current="VibeDesign Scrap" />
				<nav
					aria-label="Navigasi VibeDesign Scrap"
					className="inline-flex w-fit items-center gap-1 rounded-lg border border-graphite bg-charcoal p-1"
				>
					<Link
						to="/design/scrap"
						activeOptions={{ exact: true }}
						className="rounded-md px-3.5 py-1.5 text-xs font-semibold text-fog transition-colors hover:text-snow"
						activeProps={{ className: "bg-onyx text-snow shadow-xs" }}
					>
						Scrap
					</Link>
					<Link
						to="/design/scrap/history"
						className="rounded-md px-3.5 py-1.5 text-xs font-semibold text-fog transition-colors hover:text-snow"
						activeProps={{ className: "bg-onyx text-snow shadow-xs" }}
					>
						Riwayat
					</Link>
				</nav>
			</div>

			<Outlet />
		</div>
	);
}
