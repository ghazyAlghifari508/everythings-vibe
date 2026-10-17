import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentWebhook } from "@/features/billing/services/payment-webhook.server";

export const Route = createFileRoute("/api/payments/webhook")({
	server: { handlers: { POST: handlePaymentWebhook } },
});
