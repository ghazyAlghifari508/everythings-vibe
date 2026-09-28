import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GridBackground, HeroContent } from "@/components/layout";

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
		<main className="flex flex-col">
			<section
				className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden pb-32 md:pb-40"
				style={{ background: "var(--bg-page)" }}
			>
				<GridBackground />
				<HeroContent
					initialPrompt={search.prompt}
					initialPlatform={search.platform}
				/>
			</section>
		</main>
	);
}
