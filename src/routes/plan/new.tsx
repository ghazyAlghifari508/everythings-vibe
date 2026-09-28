import { createFileRoute } from "@tanstack/react-router";
import { GridBackground, HeroContent } from "@/components/layout";

export const Route = createFileRoute("/plan/new")({ component: PlanNewPage });

function PlanNewPage() {
	return (
		<main className="flex flex-col">
			<section
				className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden pb-32 md:pb-40"
				style={{ background: "var(--bg-page)" }}
			>
				<GridBackground />
				<HeroContent />
			</section>
		</main>
	);
}
