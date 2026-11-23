import { and, desc, eq, ne, sum } from "drizzle-orm";
import {
	creditOperations,
	productTrials,
	type ScrapeRow,
	scrapeImageAssets,
	subscriptions,
	users,
} from "@/db/schema";
import type { CreditQuote } from "@/features/billing/services/adaptive-credit";
import {
	resolveProductEntitlement,
	resolveSubscriptionState,
} from "@/features/billing/services/billing";
import {
	type CreditTransaction,
	getDatabase,
} from "@/features/billing/services/credit-db";
import { releaseCreditOperation } from "@/features/billing/services/credit-release";
import { reserveCreditOperation } from "@/features/billing/services/credit-reservation";
import { settleCreditOperation } from "@/features/billing/services/credit-settlement";
import {
	TariffLimitError,
	type TariffQuote,
} from "@/features/billing/services/pricing-policy";
import { ScrapeError } from "@/lib/design-errors";
import {
	SCRAPE_LIMITS,
	type ScrapeRequest,
	scrapeRequestSchema,
} from "../types/scrape-contract";
import {
	designViewCount,
	quoteScrape,
	SCRAPE_TARIFFS,
	settleScrapeTariff,
} from "./scrape-credit-policy";

export function serverScrapeQuote(request: ScrapeRequest) {
	return process.env.SCRAPE_CREDIT_CHARGING_ENABLED === "true"
		? quoteScrape(SCRAPE_TARIFFS, request)
		: null;
}

export async function loadScrapeQuote(
	userId: string,
	request: ScrapeRequest | null,
) {
	const quote = request ? serverScrapeQuote(request) : null;
	const { db } = await getDatabase();
	const [account] = await db
		.select({ exempt: users.billingExempt })
		.from(users)
		.where(eq(users.id, userId));
	if (!account) throw new ScrapeError("WEBSITE_BLOCKED");
	const [subscription] = await db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const [trial] = await db
		.select({ state: productTrials.state })
		.from(productTrials)
		.where(
			and(
				eq(productTrials.userId, userId),
				eq(productTrials.product, "scrape"),
				ne(productTrials.state, "released"),
			),
		)
		.limit(1);
	const effective = resolveSubscriptionState(subscription, new Date());
	const state = resolveProductEntitlement({
		subscription: effective,
		work: "trial",
		exempt: account.exempt,
		trial: trial?.state === "released" ? null : (trial?.state ?? null),
		maximumCredits: quote?.maximumCredits,
	});
	return {
		state,
		availableCredits: effective.remaining,
		quote:
			state === "paid_credit_available" || state === "insufficient_paid_credit"
				? quote
				: null,
	};
}

export async function reserveScrapeCharge(
	tx: CreditTransaction,
	row: ScrapeRow,
	request: ScrapeRequest,
	tariff: TariffQuote,
) {
	const metrics = {
		scrape: {
			requestedUnits:
				request.mode === "crawl"
					? request.settings.maxPages
					: request.mode === "design"
						? designViewCount(request.settings)
						: 1,
		},
	};
	const quote: CreditQuote = {
		operation: tariff.operation,
		pricingVersion: tariff.version,
		estimatedCredits: tariff.estimatedCredits,
		maximumCredits: tariff.maximumCredits,
		metrics,
	};
	await reserveCreditOperation(
		{
			userId: row.userId,
			operation: quote.operation,
			stage: "scrape",
			resourceType: "scrape",
			scrapeId: row.id,
			quote,
			authoritativeQuote: quote,
			metrics,
			isExempt: false,
			idempotencyKey: `scrape:${row.id}`,
		},
		tx,
	);
}

export async function findScrapeCharge(
	tx: Pick<CreditTransaction, "select">,
	row: Pick<ScrapeRow, "id" | "userId">,
) {
	const [operation] = await tx
		.select()
		.from(creditOperations)
		.where(
			and(
				eq(creditOperations.userId, row.userId),
				eq(creditOperations.scrapeId, row.id),
				eq(creditOperations.idempotencyKey, `scrape:${row.id}`),
			),
		)
		.limit(1);
	return operation;
}

export async function closeScrapeCharge(
	tx: CreditTransaction,
	row: ScrapeRow,
	outcome: "completed" | "failed" | "cancelled",
	completedUnits: number,
) {
	const operation = await findScrapeCharge(tx, row);
	if (
		!operation ||
		!["reserved", "running", "settling"].includes(operation.state)
	)
		return;
	const release = (reason: string) =>
		releaseCreditOperation(
			{ userId: row.userId, operationId: operation.id, reason },
			tx,
		);
	const request = scrapeRequestSchema.parse(row.request);
	const requested = operation.metrics.scrape?.requestedUnits ?? 0;
	const result =
		outcome === "completed"
			? (request.mode === "crawl" || request.mode === "design") &&
				completedUnits < requested
				? "partial"
				: "success"
			: outcome;
	let charge = 0;
	if (
		completedUnits > 0 &&
		outcome !== "cancelled" &&
		outcome !== "failed" &&
		!operation.isExempt
	) {
		let storageBytes = 0;
		if (row.mode === "images") {
			const [usage] = await tx
				.select({ bytes: sum(scrapeImageAssets.byteLength) })
				.from(scrapeImageAssets)
				.where(
					and(
						eq(scrapeImageAssets.userId, row.userId),
						eq(scrapeImageAssets.scrapeId, row.id),
					),
				);
			storageBytes = Number(usage?.bytes ?? 0);
		}
		try {
			charge = settleScrapeTariff(
				SCRAPE_TARIFFS,
				{
					operation: operation.kind,
					version: operation.pricingVersion,
					maximumCredits: operation.maximumCredits,
				},
				result,
				Math.min(completedUnits, requested),
				{
					images: completedUnits,
					storageBytes,
					captures: row.html ? 1 : 0,
					htmlBytes: row.html ? Buffer.byteLength(row.html) : 0,
					// Each attempt enforces its share of this bound across browser and HTTP.
					transferBytes: SCRAPE_LIMITS.captureMaxBytes,
				},
			);
		} catch (error) {
			if (!(error instanceof TariffLimitError)) throw error;
			await release(`scrape limit: ${error.message}`);
			return;
		}
	}
	if (charge === 0) await release(`scrape ${result}`);
	else
		await settleCreditOperation(
			{
				userId: row.userId,
				operationId: operation.id,
				finalCharge: charge,
				measuredUnits: completedUnits,
				artifactReference: row.id,
			},
			tx,
		);
}
