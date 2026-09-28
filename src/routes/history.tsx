import { createFileRoute, redirect } from "@tanstack/react-router";
import { HistoryPage } from "@/components/history/history-page";
import { type HistoryItem, loadHistory } from "@/lib/history";

export type { HistoryItem };

export const Route = createFileRoute("/history")({
	loader: async () => {
		try {
			return await loadHistory();
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
	return <HistoryPage items={items} />;
}
