import { createFileRoute, redirect } from "@tanstack/react-router";
import { StudioPrototypeViewer } from "@/features/studio/components/preview/studio-prototype-viewer";
import { loadStudioPrototype } from "@/features/studio/services/studio-prototype-loader.functions";
import { resolveStudioPreviewReturn } from "@/features/studio/types/studio-preview-contract";
import { studioPrototypeSearchSchema } from "@/features/studio/types/studio-prototype";

// `$id_` keeps this a sibling of the canvas route (`/design/$id`) rather than a
// child, so the canvas workspace stays mounted state-free and Back returns to it.
export const Route = createFileRoute("/design/$id_/preview")({
	head: () => ({
		meta: [{ title: "Pratinjau Prototipe | VibeDesign" }],
	}),
	validateSearch: (search) => studioPrototypeSearchSchema.parse(search),
	loader: async ({ params }) => {
		try {
			return await loadStudioPrototype({ data: { projectId: params.id } });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: StudioPreviewPage,
	errorComponent: () => (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
			<p className="rounded-xl border border-graphite bg-charcoal p-8 text-center text-sm text-mist">
				Prototipe tidak ditemukan atau gagal dimuat.
			</p>
		</main>
	),
});

function StudioPreviewPage() {
	const data = Route.useLoaderData();
	const { id } = Route.useParams();
	const search = Route.useSearch();
	return (
		<StudioPrototypeViewer
			key={data.projectId}
			data={data}
			initialFrameId={search.frameId}
			initialDevice={search.device}
			returnTo={resolveStudioPreviewReturn(search.returnTo, id)}
		/>
	);
}
