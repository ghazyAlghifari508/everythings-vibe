import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AskFlow } from "@/features/greenfield/components/ask/ask-flow";
import { useLastRoute } from "@/features/greenfield/hooks/use-last-route";
import {
	decideAskEntry,
	loadAsk,
} from "@/features/greenfield/services/ask-loader.functions";

export const Route = createFileRoute("/ask/$id")({
	loader: async ({ params }) => {
		try {
			const data = await loadAsk({ data: params.id });
			if (
				decideAskEntry(data.projectMode, data.hasReadyAnalysis) ===
				"redirect-codebase"
			) {
				if (data.codebaseId) {
					throw redirect({
						to: "/codebases/$id",
						params: { id: data.codebaseId },
					});
				}
				throw redirect({ to: "/codebases" });
			}
			return data;
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: loaderData?.projectName || "Question" }],
	}),
	component: AskPage,
	errorComponent: ({ error }) => {
		if (error instanceof Error && error.message === "NOT_FOUND") {
			return (
				<div className="p-10 text-center text-fog">Proyek tidak ditemukan.</div>
			);
		}
		return (
			<div className="p-10 text-center text-crimson">Gagal memuat halaman.</div>
		);
	},
});

function AskPage() {
	const d = Route.useLoaderData();
	const pathname = useLocation({ select: (l) => l.pathname });
	const reportLastRoute = useLastRoute(d.projectId);

	useEffect(() => {
		reportLastRoute(pathname);
	}, [pathname, reportLastRoute]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
			<AskFlow
				projectId={d.projectId}
				projectName={d.projectName}
				projectMode={d.projectMode}
				initialHandoff={d.savedHandoff}
				analysis={d.readyAnalysis}
				step={d.step}
				hasPrd={d.hasPrd}
			/>
		</div>
	);
}
