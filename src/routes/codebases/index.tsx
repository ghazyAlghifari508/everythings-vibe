import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	CodebaseLibraryError,
	CodebaseLibraryPage,
	CodebaseLibraryPending,
} from "@/features/codebase/components/planning/codebase-library-page";
import { loadCodebases } from "@/features/codebase/services/library-loader.functions";

export {
	selectLatestCodebaseSnapshots,
	selectLibraryAnalysisSlice,
	selectNewestFeatureProjectIdPerCodebase,
} from "@/features/codebase/services/library";

export function decideCodebaseListEntry(): "allow" {
	return "allow";
}

export const Route = createFileRoute("/codebases/")({
	loader: async () => {
		try {
			return await loadCodebases();
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw error;
		}
	},
	head: () => ({
		meta: [
			{ title: "Project Tersimpan | VibeEverything" },
			{
				name: "description",
				content:
					"Repository yang pernah kamu hubungkan akan tersimpan di sini. Lanjutkan dari konteks dan workspace sebelumnya.",
			},
		],
	}),
	component: CodebasesPage,
	pendingComponent: CodebaseLibraryPending,
	errorComponent: ({ reset }) => <CodebaseLibraryError onRetry={reset} />,
});

function CodebasesPage() {
	const { codebases: items } = Route.useLoaderData();
	return <CodebaseLibraryPage items={items} />;
}
