import { createFileRoute, redirect } from "@tanstack/react-router";
import { FiturDetail } from "@/features/greenfield/components/feature-tree/feature-tree-detail";
import { loadFitur } from "@/features/greenfield/services/pipeline-loaders.functions";

export const Route = createFileRoute("/vibeplan/$id/fitur")({
	loader: async ({ params }) => {
		try {
			return await loadFitur({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.projectName ?? "Fitur"} - Fitur` }],
	}),
	component: FiturPage,
	errorComponent: () => (
		<div className="p-10 text-center text-fog">
			Daftar fitur tidak ditemukan.
		</div>
	),
});

function FiturPage() {
	const d = Route.useLoaderData();
	return (
		<FiturDetail
			key={d.projectId}
			projectId={d.projectId}
			projectName={d.projectName}
			featureTree={d.featureTree}
			featuresStatus={d.featuresStatus}
			step={d.step}
		/>
	);
}
