import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/design/scrap")({
	component: ScrapLayout,
});

function ScrapLayout() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
			<Outlet />
		</div>
	);
}
