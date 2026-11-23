import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Footer } from "@/components/layout/footer";
import PricingWrapper from "@/features/billing/components/pricing-wrapper";
import { loadChargingState } from "@/features/billing/services/charging-state.functions";

export const Route = createFileRoute("/pricing")({
	loader: async () => loadChargingState(),
	component: PricingPage,
	head: () => ({
		meta: [
			{ title: "Pricing | everythings-vibe" },
			{
				name: "description",
				content:
					"Satu saldo kredit untuk VibePlan, Studio, Scrape, dan VibeTemplate. Lihat paket Free, Pro, dan Hengker.",
			},
		],
	}),
});

function PricingPage() {
	const { productChargingEnabled } = Route.useLoaderData();
	return (
		<div className="flex min-h-screen flex-col bg-onyx">
			<main className="flex-grow pt-10 pb-12">
				<Suspense
					fallback={
						<div className="pt-10 text-center text-fog">Memuat paket...</div>
					}
				>
					<PricingWrapper productChargingEnabled={productChargingEnabled} />
				</Suspense>
			</main>
			<Footer />
		</div>
	);
}
