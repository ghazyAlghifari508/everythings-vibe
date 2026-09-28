import { createFileRoute } from "@tanstack/react-router";
import { BentoHub } from "@/components/home/bento-hub";
import { GridBackground } from "@/components/layout";

export const Route = createFileRoute("/")({
	component: HomePage,
	head: () => ({
		meta: [
			{ title: "VibeEverything - All-in-One AI Vibe-Coding Workspace" },
			{
				name: "description",
				content:
					"Pilih workspace VibeEverything: menyusun PRD dan acceptance criteria, merancang antarmuka, template proyek, atau bantuan teknis.",
			},
		],
	}),
});

function HomePage() {
	return (
		<main
			className="relative flex flex-col"
			style={{ background: "var(--bg-page)" }}
		>
			<GridBackground />
			<div className="relative z-10 flex flex-1 flex-col items-center pt-14 sm:pt-20">
				<BentoHub />
			</div>
		</main>
	);
}
