import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getMidtransConfig } from "@/features/billing/services/midtrans";
import { applyOrderSuccess } from "@/features/billing/services/payment-service";

export async function handlePaymentWebhook({ request }: { request: Request }) {
	const body = await request.json();
	const { order_id, transaction_status, status_code, gross_amount } = body;

	let serverKey: string;
	try {
		serverKey = getMidtransConfig().serverKey;
	} catch {
		return Response.json({ error: "Server misconfiguration" }, { status: 500 });
	}
	const signatureKey = `${order_id}${status_code}${gross_amount}${serverKey}`;
	const expected = createHash("sha512").update(signatureKey).digest("hex");

	if (body.signature_key !== expected)
		return Response.json({ error: "Invalid signature" }, { status: 401 });

	if (["settlement", "capture"].includes(transaction_status)) {
		// A capture still under fraud review must not grant until
		// Midtrans confirms it (mirrors syncPaymentStatus): challenge
		// stays pending so a later accept notification can grant.
		if (
			transaction_status === "capture" &&
			body.fraud_status &&
			body.fraud_status !== "accept"
		) {
			return Response.json({ status: "ok" });
		}
		// Verify the notified amount against what we charged. Midtrans sends
		// gross_amount as a decimal string ("49000.00"), hence Number().
		const [stored] = await db
			.select({ amount: payments.amount })
			.from(payments)
			.where(eq(payments.orderId, order_id))
			.limit(1);
		if (!stored)
			return Response.json({ error: "Unknown order" }, { status: 404 });
		if (Number(gross_amount) !== stored.amount) {
			console.error(
				`Webhook amount mismatch for ${order_id}: got ${gross_amount}, expected ${stored.amount}`,
			);
			return Response.json({ error: "Amount mismatch" }, { status: 400 });
		}

		try {
			await applyOrderSuccess(order_id);
		} catch (err) {
			console.error("Webhook processing error:", err);
			return Response.json(
				{ status: "error", message: "Processing failed, will retry" },
				{ status: 500 },
			);
		}
	}

	// Preserve the settled marker for idempotency; reversals require manual credit reconciliation.
	if (["expire", "cancel", "deny"].includes(transaction_status)) {
		await db
			.update(payments)
			.set({ status: "failed" })
			.where(
				and(eq(payments.orderId, order_id), ne(payments.status, "success")),
			);
	}

	if (
		["refund", "chargeback", "partial_refund", "partial_chargeback"].includes(
			transaction_status,
		)
	) {
		await db
			.update(payments)
			.set({
				status: sql`case when ${payments.status} = 'success' then 'success' else 'failed' end`,
				midtransResponse: sql`(case when jsonb_typeof(${payments.midtransResponse}) = 'object' then ${payments.midtransResponse} else '{}'::jsonb end) || jsonb_build_object('reversal', case when ${payments.midtransResponse}->>'reversal' = 'chargeback' then 'chargeback' when ${transaction_status} = 'chargeback' then 'chargeback' when ${payments.midtransResponse}->>'reversal' = 'partial_chargeback' and ${transaction_status} <> 'chargeback' then 'partial_chargeback' when ${transaction_status} = 'partial_chargeback' then 'partial_chargeback' when ${payments.midtransResponse}->>'reversal' = 'refund' then 'refund' else ${transaction_status}::text end)`,
			})
			.where(eq(payments.orderId, order_id));
	}

	return Response.json({ status: "ok" });
}
