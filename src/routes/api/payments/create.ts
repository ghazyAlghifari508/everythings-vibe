import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentCreate } from "@/features/billing/services/payment-create.server";

export const Route = createFileRoute("/api/payments/create")({
	server: { handlers: { POST: handlePaymentCreate } },
});
