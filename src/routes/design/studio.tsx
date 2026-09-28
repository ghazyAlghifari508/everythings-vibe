import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/design/studio")({
	component: StudioLayout,
});

function StudioLayout() {
	return <Outlet />;
}
