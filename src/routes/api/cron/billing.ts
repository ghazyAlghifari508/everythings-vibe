import { createFileRoute } from "@tanstack/react-router";
import { handleBillingCron } from "@/features/billing/services/billing-cron.server";

export const Route = createFileRoute("/api/cron/billing")({
	server: { handlers: { GET: handleBillingCron } },
});
