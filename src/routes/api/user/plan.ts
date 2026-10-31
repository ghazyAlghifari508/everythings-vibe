import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getCreditBalance } from "@/features/billing/services/credits";
import { getSessionFromHeaders } from "@/lib/session";

export const Route = createFileRoute("/api/user/plan")({
	server: {
		handlers: {
			GET: async () => {
				const session = await getSessionFromHeaders(getRequestHeaders());
				if (!session?.user)
					return Response.json({
						authenticated: false,
						plan: "free",
						credits: 0,
						creditsUsed: 0,
						remaining: 0,
						subscriptionState: "free_active",
						currentPeriodEnd: null,
						topUpEligible: false,
						creditsExhausted: false,
					});

				const { getUserBillingEntitlement } = await import(
					"@/features/billing/services/billing-entitlement"
				);
				const [balance, entitlement] = await Promise.all([
					getCreditBalance(session.user.id),
					getUserBillingEntitlement(session.user.id),
				]);
				return Response.json({
					authenticated: true,
					...balance,
					billingExempt: entitlement.billingExempt,
					billingExemptionReason: entitlement.reason,
				});
			},
		},
	},
});
