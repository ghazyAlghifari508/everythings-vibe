import { createFileRoute } from "@tanstack/react-router";
import { PlanCodebasePage } from "@/features/codebase/components/workspace/plan-codebase-page";
import { CODEBASE_ONBOARDING_LABEL } from "@/features/codebase/services/library";
import { parsePlanCodebaseSearch } from "@/features/codebase/services/onboarding-intent";

export const Route = createFileRoute("/plan/codebase")({
	validateSearch: (search: Record<string, unknown>) =>
		parsePlanCodebaseSearch(search),
	head: () => ({
		meta: [
			{
				title: `${CODEBASE_ONBOARDING_LABEL} | everythings-vibe`,
			},
			{
				name: "description",
				content:
					"Hubungkan repository yang sudah ada untuk mendapatkan prompt CLI sync, lalu susun fitur baru di atas kode yang ada.",
			},
		],
	}),
	component: PlanCodebaseRoute,
});

// The route stays thin: it resolves the typed search param and hands the
// navigation intent to the feature container.
function PlanCodebaseRoute() {
	const { intent } = Route.useSearch();
	return <PlanCodebasePage key={intent ?? "recover"} intent={intent} />;
}
