import type { CreditOperationStage } from "@/db/schema";
import { ADAPTIVE_CREDIT_PRICING } from "@/features/billing/types/billing-constants";

export type VibePlanOperationKind =
	| "codebase_analysis"
	| "prd_generation"
	| "ac_generation"
	| "task_generation";
export type StudioOperationKind =
	| "studio.generate"
	| "studio.add_frame"
	| "studio.revise"
	| "studio.regenerate";
export type ScrapeOperationKind =
	| "scrape.crawl"
	| "scrape.html"
	| "scrape.images"
	| "scrape.design_md";
export type CreditOperationKind =
	| VibePlanOperationKind
	| StudioOperationKind
	| ScrapeOperationKind;

export type CreditPricingVersion =
	| typeof ADAPTIVE_CREDIT_PRICING.version
	| "2026-09-20";

export type CreditResourceType = "plan_project" | "studio_project" | "scrape";
export type CreditProductFamily =
	| "vibeplan_greenfield"
	| "vibeplan_codebase"
	| "studio"
	| "scrape";
/** `legacy_unknown` only labels historical rows the backfill could not prove. */
export type CreditOperationProduct = CreditProductFamily | "legacy_unknown";
/**
 * `subscription_balance` is the existing shared pool: plan allocation and
 * top-ups land in one `subscriptions.credits` counter, so no operation can
 * be attributed to one of them without changing the allocation policy.
 * One-time entitlement holds live in `product_trials`, outside the paid ledger.
 */
export type CreditFundingSource =
	| "subscription_balance"
	| "initial_analysis_allowance"
	| "exempt"
	| "trial";
export type CreditOperationFundingSource =
	| CreditFundingSource
	| "legacy_unknown";

export type CreditOperationPricing =
	| { status: "unconfigured" }
	| {
			status: "configured";
			mode: "adaptive";
			version: CreditPricingVersion;
			baseCredits: number;
			maximumCredits: number;
	  }
	| {
			status: "configured";
			mode: "fixed";
			version: CreditPricingVersion;
			credits: number;
	  };
export type ConfiguredCreditPricing = Extract<
	CreditOperationPricing,
	{ status: "configured" }
>;

/** Where the billable work lives today; TASK 11/12 bill from these rows. */
type CreditOperationSource =
	| { table: "projects" }
	| { table: "studio_jobs"; jobType: "initial" | "add" | "revise" | "retry" }
	| { table: "scrapes"; mode: "crawl" | "html" | "images" | "design" };

interface CreditOperationDefinition {
	resourceType: CreditResourceType;
	stage: CreditOperationStage;
	source: CreditOperationSource;
	pricing: CreditOperationPricing;
}

function adaptive(kind: VibePlanOperationKind): CreditOperationPricing {
	return {
		status: "configured",
		mode: "adaptive",
		version: ADAPTIVE_CREDIT_PRICING.version,
		...ADAPTIVE_CREDIT_PRICING.operations[kind],
	};
}

// ponytail: Studio/Scrape tariffs stay unconfigured until the TASK 07/09
// benchmark is approved; set `pricing` per key then, never a 0 placeholder.
const UNCONFIGURED: CreditOperationPricing = { status: "unconfigured" };

export const CREDIT_OPERATION_REGISTRY = {
	codebase_analysis: {
		resourceType: "plan_project",
		stage: "codebase",
		source: { table: "projects" },
		pricing: adaptive("codebase_analysis"),
	},
	prd_generation: {
		resourceType: "plan_project",
		stage: "prd",
		source: { table: "projects" },
		pricing: adaptive("prd_generation"),
	},
	ac_generation: {
		resourceType: "plan_project",
		stage: "ac",
		source: { table: "projects" },
		pricing: adaptive("ac_generation"),
	},
	task_generation: {
		resourceType: "plan_project",
		stage: "task",
		source: { table: "projects" },
		pricing: adaptive("task_generation"),
	},
	"studio.generate": {
		resourceType: "studio_project",
		stage: "studio",
		source: { table: "studio_jobs", jobType: "initial" },
		pricing: UNCONFIGURED,
	},
	"studio.add_frame": {
		resourceType: "studio_project",
		stage: "studio",
		source: { table: "studio_jobs", jobType: "add" },
		pricing: UNCONFIGURED,
	},
	"studio.revise": {
		resourceType: "studio_project",
		stage: "studio",
		source: { table: "studio_jobs", jobType: "revise" },
		pricing: UNCONFIGURED,
	},
	"studio.regenerate": {
		resourceType: "studio_project",
		stage: "studio",
		source: { table: "studio_jobs", jobType: "retry" },
		pricing: UNCONFIGURED,
	},
	"scrape.crawl": {
		resourceType: "scrape",
		stage: "scrape",
		source: { table: "scrapes", mode: "crawl" },
		pricing: UNCONFIGURED,
	},
	"scrape.html": {
		resourceType: "scrape",
		stage: "scrape",
		source: { table: "scrapes", mode: "html" },
		pricing: UNCONFIGURED,
	},
	"scrape.images": {
		resourceType: "scrape",
		stage: "scrape",
		source: { table: "scrapes", mode: "images" },
		pricing: UNCONFIGURED,
	},
	"scrape.design_md": {
		resourceType: "scrape",
		stage: "scrape",
		source: { table: "scrapes", mode: "design" },
		pricing: UNCONFIGURED,
	},
} satisfies Record<CreditOperationKind, CreditOperationDefinition>;

export class CreditPricingUnconfiguredError extends Error {
	readonly code = "CREDIT_PRICING_UNCONFIGURED";
	readonly operation: CreditOperationKind;

	constructor(operation: CreditOperationKind) {
		super(`Credit pricing is not configured for ${operation}`);
		this.name = "CreditPricingUnconfiguredError";
		this.operation = operation;
	}
}

export function getCreditOperationDefinition(
	kind: CreditOperationKind,
): CreditOperationDefinition {
	return CREDIT_OPERATION_REGISTRY[kind];
}

/** The only door to a tariff: unconfigured operations can never be quoted. */
export function requireConfiguredPricing(
	kind: CreditOperationKind,
): ConfiguredCreditPricing {
	const pricing = getCreditOperationDefinition(kind).pricing;
	if (pricing.status !== "configured")
		throw new CreditPricingUnconfiguredError(kind);
	return pricing;
}

export function maximumCreditsOf(pricing: ConfiguredCreditPricing): number {
	return pricing.mode === "fixed" ? pricing.credits : pricing.maximumCredits;
}
