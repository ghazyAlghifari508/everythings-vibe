import { createFileRoute, redirect } from "@tanstack/react-router";
import { CodebaseDetailPage } from "@/features/codebase/components/workspace/codebase-detail-page";
import { CodebaseWorkspaceSkeleton } from "@/features/codebase/components/workspace/codebase-workspace-skeleton";
import { loadCodebase } from "@/features/codebase/services/workspace-loader.functions";
import { decideCodebaseDetailEntry } from "@/features/codebase/utils/workspace-contracts";

export type {
	SnapshotFilePreviewResult,
	SourcePreviewState,
} from "@/features/codebase/types/source-preview";
export { toSourcePreviewState } from "@/features/codebase/types/source-preview";
export {
	buildAskHandoffAnswers,
	canRenderCodebaseReview,
	decideCodebaseDetailEntry,
	describeArtifactReadFailure,
	formatCodebaseSyncBadge,
	getCodebaseSessionRequestBody,
	resolveWorkspaceSnapshotReady,
} from "@/features/codebase/utils/workspace-contracts";

export const Route = createFileRoute("/codebases/$id")({
	loader: async ({ params }) => {
		if (decideCodebaseDetailEntry(params.id) === "deny")
			throw redirect({ to: "/codebases" });
		try {
			return await loadCodebase({ data: params.id });
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw error;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: loaderData?.codebase.name ?? "Codebase" }],
	}),
	component: CodebaseDetailRoute,
	pendingComponent: CodebaseDetailPending,
	errorComponent: ({ error, reset }) => (
		<main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
			<div
				role="alert"
				className="rounded-xl border border-crimson/40 bg-crimson/10 p-5 text-crimson"
			>
				<h1 className="text-lg font-semibold">Codebase tidak dapat dimuat</h1>
				<p className="mt-1 text-sm">
					{error instanceof Error && error.message === "NOT_FOUND"
						? "Codebase tidak ditemukan."
						: "Terjadi masalah saat membaca data codebase."}
				</p>
				<button
					type="button"
					onClick={reset}
					className="mt-4 min-h-11 rounded-md border border-crimson/50 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	),
});

export function CodebaseDetailPending() {
	return <CodebaseWorkspaceSkeleton />;
}

function CodebaseDetailRoute() {
	return <CodebaseDetailPage data={Route.useLoaderData()} />;
}
