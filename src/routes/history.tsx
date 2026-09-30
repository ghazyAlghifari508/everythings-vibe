import { createFileRoute, redirect } from "@tanstack/react-router";
import { HistoryPage } from "@/components/history/history-page";
import {
	type HistoryItem,
	historyFilterSchema,
	loadHistory,
} from "@/lib/history";

export type { HistoryItem };

export const Route = createFileRoute("/history")({
	validateSearch: (search) => historyFilterSchema.parse(search),
	loaderDeps: ({ search }) => ({ workspace: search.workspace }),
	loader: async ({ deps }) => {
		try {
			return await loadHistory({ data: { workspace: deps.workspace } });
		} catch (e) {
			if ((e as Error).message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: () => ({ meta: [{ title: "History | VibeEverything" }] }),
	component: HistoryRoutePage,
});

function HistoryRoutePage() {
	const { items } = Route.useLoaderData();
	const search = Route.useSearch();
	return <HistoryPage items={items} workspace={search.workspace} />;
}
