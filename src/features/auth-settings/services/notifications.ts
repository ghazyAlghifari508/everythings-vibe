/**
 * Notification preference actions - ported to TanStack server fn + Drizzle.
 * FormData checkboxes send "on" when checked, absent otherwise.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { requireUser } from "@/lib/session";

const _update = createServerFn({ method: "POST" })
	.validator(
		(d: {
			quotaWarning: boolean;
			prdCompleted: boolean;
			paymentUpdates: boolean;
			productUpdates: boolean;
		}) => d,
	)
	.handler(async ({ data }) => {
		const user = await requireUser(getRequestHeaders());
		const { db } = await import("@/db");
		const { notificationPreferences } = await import("@/db/schema");
		await db
			.insert(notificationPreferences)
			.values({
				id: crypto.randomUUID(),
				userId: user.id,
				quotaWarning: data.quotaWarning,
				prdCompleted: data.prdCompleted,
				paymentUpdates: data.paymentUpdates,
				productUpdates: data.productUpdates,
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: notificationPreferences.userId,
				set: {
					quotaWarning: data.quotaWarning,
					prdCompleted: data.prdCompleted,
					paymentUpdates: data.paymentUpdates,
					productUpdates: data.productUpdates,
					updatedAt: new Date(),
				},
			});
	});

export async function updateNotificationPreferences(formData: FormData) {
	await _update({
		data: {
			quotaWarning: formData.get("quota_warning") === "on",
			prdCompleted: formData.get("prd_completed") === "on",
			paymentUpdates: formData.get("payment_updates") === "on",
			productUpdates: formData.get("product_updates") === "on",
		},
	});
}
