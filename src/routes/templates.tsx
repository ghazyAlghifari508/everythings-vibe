import { createFileRoute } from "@tanstack/react-router";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { TemplateCatalog } from "@/components/templates/template-catalog";

export const Route = createFileRoute("/templates")({
	head: () => ({
		meta: [
			{ title: "VibeTemplate | VibeEverything" },
			{
				name: "description",
				content:
					"Katalog prompt profesional untuk Planning, Visual UI Design, dan Boilerplate Proyek VibeEverything.",
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
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Katalog Template Proyek
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Pilih blueprint siap pakai untuk memulai perencanaan PRD, mendesain
					antarmuka di UI Studio, atau menginisiasi proyek enterprise.
				</p>
			</header>

			<TemplateCatalog />
		</main>
	);
}
