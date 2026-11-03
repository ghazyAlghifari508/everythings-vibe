import { createFileRoute } from "@tanstack/react-router";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { PageHeading } from "@/components/ui";
import { TemplateCatalog } from "@/features/templates";

export const Route = createFileRoute("/templates")({
	head: () => ({
		meta: [
			{ title: "VibeTemplate | everythings-vibe" },
			{
				name: "description",
				content:
					"Katalog prompt profesional untuk Planning, Visual UI Design, dan Boilerplate Proyek everythings-vibe.",
			},
		],
	}),
	component: TemplatesRouteView,
});

export function TemplatesRouteView() {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="VibeTemplate" />

			<header className="mx-auto max-w-2xl text-center">
				<PageHeading variant="workspace">Katalog Template Proyek</PageHeading>
				<p className="mt-3 text-sm leading-6 text-fog">
					Pilih blueprint siap pakai untuk memulai perencanaan PRD, mendesain
					antarmuka di UI Studio, atau menginisiasi proyek enterprise.
				</p>
			</header>

			<TemplateCatalog />
		</main>
	);
}
