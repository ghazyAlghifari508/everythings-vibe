import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { CreditOperationStage } from "@/db/schema";
import type { CreditOperationState } from "@/features/billing/services/adaptive-credit";
import type {
	CreditOperationItem,
	PaginatedCreditUsageInput,
	PaginatedCreditUsageResult,
} from "../types/credit-usage";
import {
	CREDIT_OPERATION_REGISTRY,
	type CreditOperationKind,
	type CreditOperationProduct,
} from "./credit-operation-registry";

const VALID_STAGES = new Set<CreditOperationStage>([
	"codebase",
	"prd",
	"ac",
	"task",
	"studio",
	"scrape",
]);

const VALID_PRODUCTS = new Set<CreditOperationProduct>([
	"vibeplan_greenfield",
	"vibeplan_codebase",
	"studio",
	"scrape",
	"legacy_unknown",
]);

const VALID_KINDS = new Set(Object.keys(CREDIT_OPERATION_REGISTRY));

const VALID_STATES = new Set<CreditOperationState>([
	"quoted",
	"reserved",
	"running",
	"settling",
	"settled",
	"released",
	"failed",
	"quarantined",
	"refunded",
]);

export interface NormalizedCreditUsageInput {
	page: number;
	pageSize: number;
	stage?: CreditOperationStage;
	product?: CreditOperationProduct;
	kind?: CreditOperationKind;
	status?: CreditOperationState;
	projectId?: string;
}

export function normalizeCreditUsageInput(
	input?: PaginatedCreditUsageInput,
): NormalizedCreditUsageInput {
	const rawPage = input?.page;
	const page =
		typeof rawPage === "number" &&
		Number.isFinite(rawPage) &&
		rawPage >= 1 &&
		Number.isSafeInteger(Math.floor(rawPage))
			? Math.floor(rawPage)
			: 1;

	const rawPageSize = input?.pageSize;
	const pageSize =
		typeof rawPageSize === "number" &&
		Number.isFinite(rawPageSize) &&
		Number.isSafeInteger(Math.floor(rawPageSize))
			? Math.min(Math.max(1, Math.floor(rawPageSize)), 50)
			: 10;

	const rawStage =
		typeof input?.stage === "string" ? input.stage.trim() : undefined;
	const stage =
		rawStage &&
		rawStage !== "all" &&
		VALID_STAGES.has(rawStage as CreditOperationStage)
			? (rawStage as CreditOperationStage)
			: undefined;

	const rawStatus =
		typeof input?.status === "string" ? input.status.trim() : undefined;
	const status =
		rawStatus &&
		rawStatus !== "all" &&
		VALID_STATES.has(rawStatus as CreditOperationState)
			? (rawStatus as CreditOperationState)
			: undefined;

	const projectId =
		typeof input?.projectId === "string" && input.projectId.trim().length > 0
			? input.projectId.trim()
			: undefined;

	const rawProduct =
		typeof input?.product === "string" ? input.product.trim() : undefined;
	const product =
		rawProduct &&
		rawProduct !== "all" &&
		VALID_PRODUCTS.has(rawProduct as CreditOperationProduct)
			? (rawProduct as CreditOperationProduct)
			: undefined;

	const rawKind =
		typeof input?.kind === "string" ? input.kind.trim() : undefined;
	const kind =
		rawKind && rawKind !== "all" && VALID_KINDS.has(rawKind)
			? (rawKind as CreditOperationKind)
			: undefined;

	return { page, pageSize, stage, status, projectId, product, kind };
}

// ponytail: offset pagination with compound ordering (createdAt DESC, id DESC)
// is selected over cursor pagination because the UI requires bidirectional navigation
// (previous/next page, page counter, jump to page 1 on filter reset) and exact totals.
// Compound sorting guarantees deterministic pagination when operations share timestamps,
// and the composite index on (user_id, created_at) ensures performant queries over thousands of rows.
export async function queryCreditUsageHistory(
	userId: string,
	input: NormalizedCreditUsageInput,
): Promise<PaginatedCreditUsageResult> {
	const { db } = await import("@/db");
	const { creditOperations, projects, scrapes, studioProjects } = await import(
		"@/db/schema"
	);

	const conditions = [eq(creditOperations.userId, userId)];

	if (input.projectId) {
		conditions.push(eq(creditOperations.projectId, input.projectId));
	}

	if (input.stage) {
		conditions.push(eq(creditOperations.stage, input.stage));
	}

	if (input.product) {
		conditions.push(eq(creditOperations.product, input.product));
	}

	if (input.kind) {
		conditions.push(eq(creditOperations.kind, input.kind));
	}

	if (input.status) {
		// Both 'running' and 'settling' map to the Indonesian "Diproses" status
		if (input.status === "running") {
			conditions.push(inArray(creditOperations.state, ["running", "settling"]));
		} else {
			conditions.push(eq(creditOperations.state, input.status));
		}
	}

	const whereClause =
		conditions.length === 1 ? conditions[0] : and(...conditions);

	const baseQuery = db
		.select({
			id: creditOperations.id,
			product: creditOperations.product,
			fundingSource: creditOperations.fundingSource,
			projectId: creditOperations.projectId,
			projectName: projects.name,
			studioTitle: studioProjects.title,
			scrapeTitle: scrapes.title,
			scrapeSourceUrl: scrapes.sourceUrl,
			kind: creditOperations.kind,
			stage: creditOperations.stage,
			state: creditOperations.state,
			estimatedCredits: creditOperations.estimatedCredits,
			reservedCredits: creditOperations.reservedCredits,
			maximumCredits: creditOperations.maximumCredits,
			finalCharge: creditOperations.finalCharge,
			pricingVersion: creditOperations.pricingVersion,
			metrics: creditOperations.metrics,
			usage: creditOperations.usage,
			capApplied: creditOperations.capApplied,
			createdAt: creditOperations.createdAt,
			settledAt: creditOperations.settledAt,
		})
		.from(creditOperations)
		.leftJoin(
			projects,
			and(
				eq(projects.id, creditOperations.projectId),
				eq(projects.userId, userId),
			),
		)
		.leftJoin(
			studioProjects,
			and(
				eq(studioProjects.id, creditOperations.studioProjectId),
				eq(studioProjects.userId, userId),
			),
		)
		.leftJoin(
			scrapes,
			and(
				eq(scrapes.id, creditOperations.scrapeId),
				eq(scrapes.userId, userId),
			),
		)
		.where(whereClause)
		.orderBy(desc(creditOperations.createdAt), desc(creditOperations.id))
		.limit(input.pageSize);

	const offsetQuery =
		input.page > 1 &&
		"offset" in baseQuery &&
		typeof (baseQuery as { offset: (n: number) => unknown }).offset ===
			"function"
			? (baseQuery as { offset: (n: number) => typeof baseQuery }).offset(
					(input.page - 1) * input.pageSize,
				)
			: baseQuery;

	const [countResult, rows] = await Promise.all([
		db.select({ total: count() }).from(creditOperations).where(whereClause),
		offsetQuery,
	]);

	const total = Number(
		Array.isArray(countResult) && countResult[0] && "total" in countResult[0]
			? countResult[0].total
			: 0,
	);
	const totalPages = Math.max(1, Math.ceil(total / input.pageSize));

	const safeRows = Array.isArray(rows) ? rows : [];
	const items: CreditOperationItem[] = safeRows.map((op) => ({
		id: op.id,
		product: op.product,
		fundingSource: op.fundingSource,
		projectId: op.projectId,
		resourceName:
			op.product === "studio"
				? (op.studioTitle ?? null)
				: op.product === "scrape"
					? (op.scrapeTitle ?? op.scrapeSourceUrl ?? null)
					: (op.projectName ?? null),
		resourceUrl: op.product === "scrape" ? op.scrapeSourceUrl : null,
		kind: op.kind,
		stage: op.stage,
		state: op.state,
		estimatedCredits: op.estimatedCredits,
		reservedCredits: op.reservedCredits,
		maximumCredits: op.maximumCredits,
		finalCharge: op.finalCharge,
		pricingVersion: op.pricingVersion,
		metrics: op.metrics,
		usage: op.usage ?? null,
		capApplied: op.capApplied,
		createdAt:
			op.createdAt instanceof Date
				? op.createdAt.toISOString()
				: (op.createdAt ?? null),
		settledAt:
			op.settledAt instanceof Date
				? op.settledAt.toISOString()
				: (op.settledAt ?? null),
	}));

	return {
		items,
		total,
		page: input.page,
		pageSize: input.pageSize,
		totalPages,
	};
}

export const loadCreditUsageHistory = createServerFn({ method: "GET" })
	.validator((input?: PaginatedCreditUsageInput) => {
		return normalizeCreditUsageInput(input);
	})
	.handler(async ({ data }): Promise<PaginatedCreditUsageResult> => {
		const { requireUserServer } = await import("@/lib/session");
		const user = await requireUserServer();
		return queryCreditUsageHistory(user.id, data);
	});
