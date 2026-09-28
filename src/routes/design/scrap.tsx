import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/design/scrap")({
	component: ScrapLayout,
});

function ScrapLayout() {
	return <Outlet />;
}
