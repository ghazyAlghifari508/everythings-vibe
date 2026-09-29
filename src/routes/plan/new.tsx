import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { HeroContent } from "@/components/layout";

export const planNewSearchSchema = z.object({
	prompt: z.string().optional(),
	platform: z.enum(["web", "mobile"]).optional(),
});

export const Route = createFileRoute("/plan/new")({
	validateSearch: (search) => planNewSearchSchema.parse(search),
	component: PlanNewPage,
});

function PlanNewPage() {
	const search = Route.useSearch();
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<HubBreadcrumb
				current="Projek Baru (Greenfield)"
				parent={{ label: "VibePlan", to: "/plan" }}
			/>
			<HeroContent
				initialPrompt={search.prompt}
				initialPlatform={search.platform}
				hideModeSelector
			/>
		</main>
	);
}
