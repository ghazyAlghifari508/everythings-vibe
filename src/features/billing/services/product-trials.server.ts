import { createHash } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { productTrials, subscriptions, users } from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { resolveProductEntitlement, resolveSubscriptionState } from "./billing";
import { type CreditTransaction, getDatabase } from "./credit-db";

type Product = typeof productTrials.$inferSelect.product;

export const STUDIO_TRIAL_FRAMES = 1;
export const SCRAPE_TRIAL_PAGES = 3;
export const SCRAPE_TRIAL_VIEWS = 2;

export async function admitProductWork(
	tx: CreditTransaction,
	userId: string,
	product: Product,
	work: "trial" | "paid",
	request?: { key?: string; payload: unknown; maximumCredits?: number },
) {
	const [account] = await tx
		.select({ exempt: users.billingExempt })
		.from(users)
		.where(eq(users.id, userId))
		.for("update");
	if (!account) throw new ScrapeError("WEBSITE_BLOCKED");
	const scope = and(
		eq(productTrials.userId, userId),
		eq(productTrials.product, product),
	);
	const hash =
		request &&
		createHash("sha256").update(JSON.stringify(request.payload)).digest("hex");
	if (request?.key && hash) {
		const [replay] = await tx
			.select()
			.from(productTrials)
			.where(and(scope, eq(productTrials.requestKey, request.key)));
		if (replay) {
			if (replay.requestHash !== hash)
				throw new ScrapeError(
					"INVALID_URL",
					"Request key sudah dipakai untuk parameter berbeda.",
				);
			return { kind: "replay", jobId: replay.jobId } as const;
		}
	}
	const [subscription] = await tx
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1)
		.for("update");
	const [liveTrial] = await tx
		.select({ state: productTrials.state })
		.from(productTrials)
		.where(and(scope, ne(productTrials.state, "released")))
		.limit(1);
	const decision = resolveProductEntitlement({
		subscription: resolveSubscriptionState(subscription, new Date()),
		exempt: account.exempt,
		work,
		trial: liveTrial?.state === "released" ? null : (liveTrial?.state ?? null),
		maximumCredits: request?.maximumCredits,
	});
	switch (decision) {
		case "insufficient_paid_credit":
			throw new ScrapeError("INSUFFICIENT_CREDITS");
		case "trial_available":
			if (!hash) throw new ScrapeError("STORAGE_FAILED");
			return {
				kind: "trial",
				reserve: async (jobId: string) => {
					await tx.insert(productTrials).values({
						userId,
						product,
						jobId,
						requestKey: request?.key ?? jobId,
						requestHash: hash,
					});
				},
			} as const;
		case "trial_reserved":
			throw new ScrapeError("TRIAL_RESERVED");
		case "trial_exhausted":
			throw new ScrapeError("TRIAL_EXHAUSTED");
		case "plan_gated":
			throw new ScrapeError("PRODUCT_PLAN_REQUIRED");
		default:
			return { kind: "legacy" } as const;
	}
}

export async function requirePaidProductWork(userId: string, product: Product) {
	const { db } = await getDatabase();
	await db.transaction((tx) => admitProductWork(tx, userId, product, "paid"));
}
