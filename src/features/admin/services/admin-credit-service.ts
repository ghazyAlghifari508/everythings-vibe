import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
	and,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { creditOperations as creditOperationsTable } from "@/db/schema";
import type { CreditOperationProduct } from "@/features/billing/services/credit-operation-registry";
import { requireAdmin } from "@/lib/session";
import type {
	AdminCreditBreakdownItem,
	AdminCreditSearchParams,
	AdminCreditUsageResult,
	AdminCreditUsageSummary,
	AdminOperationalCostStats,
} from "../types/admin-credit";
import {
	adminCreditSearchSchema,
	adminOperationalCostFilterSchema,
} from "../types/admin-credit";
import type { CreditDateWindow } from "../utils/admin-credit-utils";
import {
	creditStatesForStatus,
	productFamilyLabel,
	resolveDateWindow,
} from "../utils/admin-credit-utils";
import { adminDb } from "./admin-db";

const CREDIT_PRODUCTS = [
	"vibeplan_greenfield",
	"vibeplan_codebase",
	"studio",
	"scrape",
	"legacy_unknown",
] as const;

function numeric(value: number | string | null): number | null {
	if (value === null) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Shared by the table, KPI aggregation, and breakdown. Applied before pagination. */
function creditOperationConditions(
	data: AdminCreditSearchParams,
	creditOperations: typeof creditOperationsTable,
	window: CreditDateWindow,
): (SQL | undefined)[] {
	const conditions: (SQL | undefined)[] = [];
	if (window.start)
		conditions.push(gte(creditOperations.createdAt, window.start));
	if (window.end) conditions.push(lte(creditOperations.createdAt, window.end));
	if (data.product !== "all")
		conditions.push(eq(creditOperations.product, data.product));
	if (data.operation !== "all")
		conditions.push(eq(creditOperations.kind, data.operation));
	const states = creditStatesForStatus(data.status);
	if (states.length)
		conditions.push(inArray(creditOperations.state, [...states]));
	if (data.fundingSource !== "all")
		conditions.push(eq(creditOperations.fundingSource, data.fundingSource));
	return conditions;
}

export const listAdminCreditUsage = createServerFn({ method: "GET" })
	.validator((data: unknown) => adminCreditSearchSchema.parse(data))
	.handler(async ({ data }): Promise<AdminCreditUsageResult> => {
		await requireAdmin(await getRequestHeaders());
		const { db, users, projects, studioProjects, scrapes, creditOperations } =
			await adminDb();

		const window = resolveDateWindow(data.from, data.to);
		const conditions = creditOperationConditions(
			data,
			creditOperations,
			window,
		);
		if (data.search.trim()) {
			const q = `%${data.search.trim()}%`;
			conditions.push(
				or(
					ilike(users.name, q),
					ilike(users.email, q),
					ilike(creditOperations.id, q),
				),
			);
		}
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const offset = (data.page - 1) * data.pageSize;

		const [rows, totalResult] = await Promise.all([
			db
				.select({
					id: creditOperations.id,
					createdAt: creditOperations.createdAt,
					userName: users.name,
					userEmail: users.email,
					product: creditOperations.product,
					operation: creditOperations.kind,
					stage: creditOperations.stage,
					state: creditOperations.state,
					resourceType: creditOperations.resourceType,
					resourceLabel: sql<
						string | null
					>`coalesce(${projects.name}, ${studioProjects.title}, ${scrapes.domain})`,
					resourceId: sql<
						string | null
					>`coalesce(${creditOperations.projectId}, ${creditOperations.studioProjectId}, ${creditOperations.scrapeId})`,
					estimatedCredits: creditOperations.estimatedCredits,
					reservedCredits: creditOperations.reservedCredits,
					finalCharge: creditOperations.finalCharge,
					fundingSource: creditOperations.fundingSource,
					pricingVersion: creditOperations.pricingVersion,
				})
				.from(creditOperations)
				.leftJoin(users, eq(users.id, creditOperations.userId))
				.leftJoin(projects, eq(projects.id, creditOperations.projectId))
				.leftJoin(
					studioProjects,
					eq(studioProjects.id, creditOperations.studioProjectId),
				)
				.leftJoin(scrapes, eq(scrapes.id, creditOperations.scrapeId))
				.where(whereClause)
				.orderBy(desc(creditOperations.createdAt), desc(creditOperations.id))
				.limit(data.pageSize)
				.offset(offset),
			db
				.select({ count: sql<number>`count(*)::int` })
				.from(creditOperations)
				.leftJoin(users, eq(users.id, creditOperations.userId))
				.where(whereClause),
		]);

		const totalCount = Number(totalResult[0]?.count ?? 0);
		return {
			rows: rows.map((row) => ({
				id: row.id,
				createdAt: row.createdAt ? row.createdAt.toISOString() : null,
				userName: row.userName,
				userEmail: row.userEmail,
				product: row.product,
				operation: row.operation,
				stage: row.stage,
				state: row.state,
				resourceType: row.resourceType,
				resourceLabel: row.resourceLabel,
				resourceId: row.resourceId,
				estimatedCredits: row.estimatedCredits,
				reservedCredits: row.reservedCredits,
				finalCharge: row.finalCharge,
				fundingSource: row.fundingSource,
				pricingVersion: row.pricingVersion,
			})),
			totalCount,
			page: data.page,
			pageSize: data.pageSize,
			totalPages: Math.max(1, Math.ceil(totalCount / data.pageSize)),
		};
	});

/**
 * Date window applies to credit operation creation, including ledger rows
 * attributed to their operation. Settled consumption and refunds come from
 * credit_ledger_entries; reservations from credit_operations state. Every KPI
 * uses the same filters as the table, except free-text user search.
 */
export const getAdminCreditUsageSummary = createServerFn({ method: "GET" })
	.validator((data: unknown) => adminCreditSearchSchema.parse(data))
	.handler(async ({ data }): Promise<AdminCreditUsageSummary> => {
		await requireAdmin(await getRequestHeaders());
		const { db, creditOperations, creditLedgerEntries } = await adminDb();
		const window = resolveDateWindow(data.from, data.to);
		const whereClause = and(
			...creditOperationConditions(data, creditOperations, window),
		);

		const [ledger, operations, breakdownRows] = await Promise.all([
			db
				.select({
					settledCreditsUsed: sql<number>`coalesce(sum(-${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.entryType} = 'debit'), 0)::int`,
					refundedCredits: sql<number>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.entryType} = 'refund'), 0)::int`,
					releasedReservationCredits: sql<number>`coalesce(sum(${creditLedgerEntries.amount}) filter (where ${creditLedgerEntries.entryType} = 'release' and ${creditOperations.state} = 'released'), 0)::int`,
					releasedReservationCount: sql<number>`count(*) filter (where ${creditLedgerEntries.entryType} = 'release' and ${creditOperations.state} = 'released')::int`,
				})
				.from(creditLedgerEntries)
				.innerJoin(
					creditOperations,
					eq(creditLedgerEntries.operationId, creditOperations.id),
				)
				.where(whereClause),
			db
				.select({
					activeReservedCredits: sql<number>`coalesce(sum(${creditOperations.reservedCredits}) filter (where ${creditOperations.state} in ('reserved', 'running', 'settling', 'quarantined')), 0)::int`,
					success: sql<number>`count(*) filter (where ${creditOperations.state} = 'settled')::int`,
					partial: sql<number>`count(*) filter (where ${creditOperations.state} = 'released')::int`,
					failed: sql<number>`count(*) filter (where ${creditOperations.state} = 'failed')::int`,
					refunded: sql<number>`count(*) filter (where ${creditOperations.state} = 'refunded')::int`,
					quarantined: sql<number>`count(*) filter (where ${creditOperations.state} = 'quarantined')::int`,
					active: sql<number>`count(*) filter (where ${creditOperations.state} in ('quoted', 'reserved', 'running', 'settling'))::int`,
				})
				.from(creditOperations)
				.where(whereClause),
			db
				.select({
					product: creditOperations.product,
					credits: sql<number>`coalesce(sum(-${creditLedgerEntries.amount}), 0)::int`,
					operations: sql<number>`count(distinct ${creditLedgerEntries.operationId})::int`,
				})
				.from(creditLedgerEntries)
				.innerJoin(
					creditOperations,
					eq(creditLedgerEntries.operationId, creditOperations.id),
				)
				.where(and(whereClause, eq(creditLedgerEntries.entryType, "debit")))
				.groupBy(creditOperations.product),
		]);

		const debitByProduct = new Map<
			CreditOperationProduct,
			{ credits: number; operations: number }
		>();
		for (const row of breakdownRows)
			debitByProduct.set(row.product, {
				credits: Number(row.credits),
				operations: Number(row.operations),
			});

		const breakdown: AdminCreditBreakdownItem[] = CREDIT_PRODUCTS.map(
			(product) => ({
				product,
				label: productFamilyLabel(product),
				settledCredits: debitByProduct.get(product)?.credits ?? 0,
				settledOperations: debitByProduct.get(product)?.operations ?? 0,
			}),
		);

		return {
			windowStart: window.start ? window.start.toISOString() : null,
			windowEnd: window.end ? window.end.toISOString() : null,
			settledCreditsUsed: Number(ledger[0]?.settledCreditsUsed ?? 0),
			activeReservedCredits: Number(operations[0]?.activeReservedCredits ?? 0),
			refundedCredits: Number(ledger[0]?.refundedCredits ?? 0),
			releasedReservationCount: Number(
				ledger[0]?.releasedReservationCount ?? 0,
			),
			releasedReservationCredits: Number(
				ledger[0]?.releasedReservationCredits ?? 0,
			),
			outcomeCounts: {
				success: Number(operations[0]?.success ?? 0),
				partial: Number(operations[0]?.partial ?? 0),
				failed: Number(operations[0]?.failed ?? 0),
				refunded: Number(operations[0]?.refunded ?? 0),
				quarantined: Number(operations[0]?.quarantined ?? 0),
				active: Number(operations[0]?.active ?? 0),
			},
			// Trial funding is reserved for a later task and is never written
			// here. Reporting zero would invent a capability that does not exist.
			trialUsageAvailable: false,
			breakdown,
		};
	});

/** Actual shadow telemetry only. Never converted into user credit charges. */
export const getAdminOperationalCostStats = createServerFn({ method: "GET" })
	.validator((data: unknown) => adminOperationalCostFilterSchema.parse(data))
	.handler(async ({ data }): Promise<AdminOperationalCostStats> => {
		await requireAdmin(await getRequestHeaders());
		const { db, shadowUsageRecords } = await adminDb();
		const window = resolveDateWindow(data.from, data.to);
		const conditions: (SQL | undefined)[] = [];
		if (window.start)
			conditions.push(gte(shadowUsageRecords.recordedAt, window.start));
		if (window.end)
			conditions.push(lte(shadowUsageRecords.recordedAt, window.end));
		if (data.product === "studio" || data.product === "scrape")
			conditions.push(eq(shadowUsageRecords.productFamily, data.product));
		else if (data.product !== "all") conditions.push(sql`false`);
		if (data.operation !== "all")
			conditions.push(eq(shadowUsageRecords.operationKind, data.operation));
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [row] = await db
			.select({
				requests: sql<number>`count(*)::int`,
				aiRequests: sql<number>`count(*) filter (where ${shadowUsageRecords.providerUsage} is not null)::int`,
				inputTokens: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.providerUsage}->>'inputTokens')::int, 0)) filter (where ${shadowUsageRecords.providerUsage} is not null)::bigint`,
				outputTokens: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.providerUsage}->>'outputTokens')::int, 0)) filter (where ${shadowUsageRecords.providerUsage} is not null)::bigint`,
				workerDurationMs: sql<
					number | null
				>`sum(coalesce(${shadowUsageRecords.durationMs}, 0))::bigint`,
				browserDurationMs: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.metrics}->>'browserRuntimeMs')::bigint, 0))::bigint`,
				downloadedBytes: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.metrics}->>'downloadedBytes')::bigint, 0))::bigint`,
				outputBytes: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.metrics}->>'outputBytes')::bigint, 0))::bigint`,
				measuredProviderCostMinor: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.cost}->>'measuredProviderMinor')::numeric, 0))::numeric`,
				estimatedProviderCostMinor: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.cost}->>'estimatedProviderMinor')::numeric, 0))::numeric`,
				estimatedInfrastructureCostMinor: sql<
					number | null
				>`sum(coalesce((${shadowUsageRecords.cost}->>'estimatedInfrastructureMinor')::numeric, 0))::numeric`,
				currency: sql<
					string | null
				>`min(${shadowUsageRecords.cost}->>'currency')`,
			})
			.from(shadowUsageRecords)
			.where(whereClause);

		return {
			generatedAt: new Date().toISOString(),
			windowStart: window.start ? window.start.toISOString() : null,
			windowEnd: window.end ? window.end.toISOString() : null,
			sampledRecords: Number(row?.requests ?? 0),
			requests: Number(row?.requests ?? 0),
			aiRequests: Number(row?.aiRequests ?? 0),
			inputTokens: numeric(row?.inputTokens ?? null),
			outputTokens: numeric(row?.outputTokens ?? null),
			workerDurationMs: numeric(row?.workerDurationMs ?? null),
			browserDurationMs: numeric(row?.browserDurationMs ?? null),
			downloadedBytes: numeric(row?.downloadedBytes ?? null),
			outputBytes: numeric(row?.outputBytes ?? null),
			measuredProviderCostMinor: numeric(
				row?.measuredProviderCostMinor ?? null,
			),
			estimatedProviderCostMinor: numeric(
				row?.estimatedProviderCostMinor ?? null,
			),
			estimatedInfrastructureCostMinor: numeric(
				row?.estimatedInfrastructureCostMinor ?? null,
			),
			currency: row?.currency ?? null,
		};
	});
