import { z } from "zod";
import type { CreditOperationStage } from "@/db/schema";
import type { CreditOperationState } from "@/features/billing/services/adaptive-credit";
import type {
	CreditOperationFundingSource,
	CreditOperationKind,
	CreditOperationProduct,
} from "@/features/billing/services/credit-operation-registry";

export const CREDIT_PRODUCT_FILTERS = [
	"all",
	"vibeplan_greenfield",
	"vibeplan_codebase",
	"studio",
	"scrape",
	"legacy_unknown",
] as const satisfies readonly ("all" | CreditOperationProduct)[];

export const CREDIT_OPERATION_KIND_FILTERS = [
	"all",
	"codebase_analysis",
	"prd_generation",
	"ac_generation",
	"task_generation",
	"studio.generate",
	"studio.add_frame",
	"studio.revise",
	"studio.regenerate",
	"scrape.crawl",
	"scrape.html",
	"scrape.images",
	"scrape.design_md",
] as const satisfies readonly ("all" | CreditOperationKind)[];

export const CREDIT_STATUS_FILTERS = [
	"all",
	"settled",
	"active",
	"released",
	"failed",
	"refunded",
	"quarantined",
] as const;

export const CREDIT_FUNDING_FILTERS = [
	"all",
	"subscription_balance",
	"initial_analysis_allowance",
	"exempt",
	"trial",
	"legacy_unknown",
] as const satisfies readonly ("all" | CreditOperationFundingSource)[];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const adminCreditSearchSchema = z.object({
	tab: z.enum(["usage", "cost"]).catch("usage"),
	page: z.coerce.number().int().min(1).max(10_000).catch(1),
	pageSize: z.coerce.number().int().min(1).max(100).catch(20),
	from: isoDate.optional(),
	to: isoDate.optional(),
	product: z.enum(CREDIT_PRODUCT_FILTERS).catch("all"),
	operation: z.enum(CREDIT_OPERATION_KIND_FILTERS).catch("all"),
	status: z.enum(CREDIT_STATUS_FILTERS).catch("all"),
	search: z.string().max(128).catch(""),
	fundingSource: z.enum(CREDIT_FUNDING_FILTERS).catch("all"),
});

export type AdminCreditSearchParams = z.infer<typeof adminCreditSearchSchema>;
export type AdminCreditProductFilter = AdminCreditSearchParams["product"];
export type AdminCreditOperationFilter = AdminCreditSearchParams["operation"];
export type AdminCreditStatusFilter = AdminCreditSearchParams["status"];
export type AdminCreditFundingFilter = AdminCreditSearchParams["fundingSource"];

export type AdminCreditOutcome =
	| "success"
	| "partial"
	| "failed"
	| "refunded"
	| "quarantined"
	| "active";

export interface AdminCreditUsageRow {
	id: string;
	createdAt: string | null;
	userName: string | null;
	userEmail: string | null;
	product: CreditOperationProduct;
	operation: CreditOperationKind;
	stage: CreditOperationStage;
	state: CreditOperationState;
	resourceType: "plan_project" | "studio_project" | "scrape";
	resourceLabel: string | null;
	resourceId: string | null;
	estimatedCredits: number;
	reservedCredits: number;
	finalCharge: number | null;
	fundingSource: CreditOperationFundingSource;
	pricingVersion: string;
}

export interface AdminCreditUsageResult {
	rows: AdminCreditUsageRow[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface AdminCreditBreakdownItem {
	product: CreditOperationProduct;
	label: string;
	settledCredits: number;
	settledOperations: number;
}

export interface AdminCreditOutcomeCounts {
	success: number;
	partial: number;
	failed: number;
	refunded: number;
	quarantined: number;
	active: number;
}

export interface AdminCreditUsageSummary {
	windowStart: string | null;
	windowEnd: string | null;
	settledCreditsUsed: number;
	activeReservedCredits: number;
	refundedCredits: number;
	releasedReservationCount: number;
	releasedReservationCredits: number;
	outcomeCounts: AdminCreditOutcomeCounts;
	/** Trial enforcement is not implemented; never render an invented zero. */
	trialUsageAvailable: boolean;
	breakdown: AdminCreditBreakdownItem[];
}

export interface AdminCreditDetail {
	id: string;
	createdAt: string | null;
	userEmail: string | null;
	product: CreditOperationProduct;
	operation: CreditOperationKind;
	stage: CreditOperationStage;
	state: CreditOperationState;
	resourceLabel: string | null;
	estimatedCredits: number;
	reservedCredits: number;
	finalCharge: number | null;
	fundingSource: CreditOperationFundingSource;
	pricingVersion: string;
}

export const adminOperationalCostFilterSchema = z.object({
	from: isoDate.optional(),
	to: isoDate.optional(),
	product: z.enum(CREDIT_PRODUCT_FILTERS).catch("all"),
	operation: z.enum(CREDIT_OPERATION_KIND_FILTERS).catch("all"),
});

export type AdminOperationalCostFilter = z.infer<
	typeof adminOperationalCostFilterSchema
>;

export interface AdminOperationalCostStats {
	generatedAt: string;
	windowStart: string | null;
	windowEnd: string | null;
	sampledRecords: number;
	requests: number;
	aiRequests: number;
	inputTokens: number | null;
	outputTokens: number | null;
	workerDurationMs: number | null;
	browserDurationMs: number | null;
	downloadedBytes: number | null;
	outputBytes: number | null;
	measuredProviderCostMinor: number | null;
	estimatedProviderCostMinor: number | null;
	estimatedInfrastructureCostMinor: number | null;
	currency: string | null;
}
