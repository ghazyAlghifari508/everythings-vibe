import { createFileRoute } from "@tanstack/react-router";
import { PlanCodebasePage } from "@/features/codebase/components/workspace/plan-codebase-page";
import { CODEBASE_ONBOARDING_LABEL } from "@/features/codebase/services/library";

export const Route = createFileRoute("/plan/codebase")({
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
	component: PlanCodebasePage,
});
