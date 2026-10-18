import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { FiturDetail } from "@/features/greenfield/components/feature-tree/feature-tree-detail";
import { useLastRoute } from "@/features/greenfield/hooks/use-last-route";
import { loadFitur } from "@/features/greenfield/services/pipeline-loaders.functions";

export const Route = createFileRoute("/fitur/$id")({
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
	const pathname = useLocation({ select: (l) => l.pathname });
	const reportLastRoute = useLastRoute(d.projectId);

	useEffect(() => {
		reportLastRoute(pathname);
	}, [pathname, reportLastRoute]);
	return (
		<FiturDetail
			projectId={d.projectId}
			projectName={d.projectName}
			featureTree={d.featureTree}
			featuresStatus={d.featuresStatus}
			step={d.step}
		/>
	);
}
