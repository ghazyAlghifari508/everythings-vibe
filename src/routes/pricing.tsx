import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Footer } from "@/components/layout/footer";
import PricingWrapper from "@/components/ui/pricing-card";

export const Route = createFileRoute("/pricing")({
	component: PricingPage,
	head: () => ({
		meta: [
			{ title: "Pricing | VibeEverything" },
			{
				name: "description",
				content:
					"Pilih paket yang sesuai untuk kebutuhan PRD otomatis tim Anda.",
			},
		],
	}),
});

function PricingPage() {
	return (
		<div className="flex min-h-screen flex-col bg-onyx">
			<main className="flex-grow pt-10 pb-12">
				<Suspense
					fallback={
						<div className="pt-10 text-center text-fog">Memuat paket...</div>
					}
				>
					<PricingWrapper />
				</Suspense>
			</main>
			<Footer />
		</div>
	);
}
