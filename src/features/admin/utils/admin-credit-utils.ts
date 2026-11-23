import type { CreditOperationState } from "@/features/billing/services/adaptive-credit";
import { CREDIT_OPERATION_REGISTRY } from "@/features/billing/services/credit-operation-registry";
import type {
	AdminCreditDetail,
	AdminCreditFundingFilter,
	AdminCreditOperationFilter,
	AdminCreditOutcome,
	AdminCreditProductFilter,
	AdminCreditStatusFilter,
	AdminCreditUsageRow,
} from "../types/admin-credit";

export interface CreditDateWindow {
	start: Date | null;
	end: Date | null;
}

function validDay(value: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== value
		? null
		: value;
}

/** Date-window semantics: inclusive UTC days, applied to operation creation. */
export function resolveDateWindow(
	from?: string,
	to?: string,
): CreditDateWindow {
	const startDay = validDay(from ?? "");
	const endDay = validDay(to ?? "");
	if (!startDay && !endDay) return { start: null, end: null };

	const [lower, upper] =
		startDay && endDay && startDay > endDay
			? [endDay, startDay]
			: [startDay, endDay];

	return {
		start: lower ? new Date(`${lower}T00:00:00.000Z`) : null,
		end: upper ? new Date(`${upper}T23:59:59.999Z`) : null,
	};
}

const STATUS_STATES: Record<
	Exclude<AdminCreditStatusFilter, "all">,
	readonly CreditOperationState[]
> = {
	settled: ["settled"],
	active: ["reserved", "running", "settling"],
	released: ["released"],
	failed: ["failed"],
	refunded: ["refunded"],
	quarantined: ["quarantined"],
};

export function creditStatesForStatus(
	status: AdminCreditStatusFilter,
): readonly CreditOperationState[] {
	return status === "all" ? [] : STATUS_STATES[status];
}

export function creditOutcomeOf(
	state: CreditOperationState,
): AdminCreditOutcome {
	switch (state) {
		case "settled":
			return "success";
		case "released":
			return "partial";
		case "failed":
			return "failed";
		case "refunded":
			return "refunded";
		case "quarantined":
			return "quarantined";
		default:
			return "active";
	}
}

export const CREDIT_PRODUCT_LABELS = {
	vibeplan_greenfield: "Greenfield",
	vibeplan_codebase: "Codebase Existing",
	studio: "Studio",
	scrape: "Scrape",
	legacy_unknown: "Legacy / tidak dikenal",
} as const;

export function productFamilyLabel(
	product: Exclude<AdminCreditProductFilter, "all">,
): string {
	return CREDIT_PRODUCT_LABELS[product];
}

export const CREDIT_OPERATION_LABELS: Record<
	Exclude<AdminCreditOperationFilter, "all">,
	string
> = {
	codebase_analysis: "Analisis codebase",
	prd_generation: "Pembuatan PRD",
	ac_generation: "Pembuatan AC",
	task_generation: "Pembuatan task",
	"studio.generate": "Studio, generate",
	"studio.add_frame": "Studio, tambah frame",
	"studio.revise": "Studio, revisi",
	"studio.regenerate": "Studio, regenerate",
	"scrape.crawl": "Scrape, crawl",
	"scrape.html": "Scrape, HTML",
	"scrape.images": "Scrape, gambar",
	"scrape.design_md": "Scrape, DESIGN.md",
};

export const CREDIT_FUNDING_LABELS: Record<
	Exclude<AdminCreditFundingFilter, "all">,
	string
> = {
	subscription_balance: "Saldo langganan",
	initial_analysis_allowance: "Kuota analisis awal",
	exempt: "Dibebaskan",
	trial: "Trial",
	legacy_unknown: "Legacy / tidak dikenal",
};

export function operationLabel(
	operation: Exclude<AdminCreditOperationFilter, "all">,
): string {
	return CREDIT_OPERATION_LABELS[operation];
}

export function fundingSourceLabel(
	source: Exclude<AdminCreditFundingFilter, "all">,
): string {
	return CREDIT_FUNDING_LABELS[source];
}

export function formatBytes(bytes: number | null): string {
	if (bytes === null) return "Tidak diukur";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detail projection is an allowlist. Credit operations may carry prompt-sized
 * metrics, artifact references, and failure payloads that must never reach an
 * admin view as raw text.
 */
export function toAdminCreditDetail(
	row: AdminCreditUsageRow,
): AdminCreditDetail {
	return {
		id: row.id,
		createdAt: row.createdAt,
		userEmail: row.userEmail,
		product: row.product,
		operation: row.operation,
		stage: row.stage,
		state: row.state,
		resourceLabel: row.resourceLabel,
		estimatedCredits: row.estimatedCredits,
		reservedCredits: row.reservedCredits,
		finalCharge: row.finalCharge,
		fundingSource: row.fundingSource,
		pricingVersion: row.pricingVersion,
	};
}

export function formatDuration(ms: number | null): string {
	if (ms === null) return "Tidak diukur";
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)} dtk`;
	return `${(ms / 60_000).toFixed(1)} mnt`;
}

export function formatMinorAmount(
	amount: number | null,
	currency: string | null,
): string {
	if (amount === null) return "Tidak diketahui";
	return `${amount.toLocaleString("id-ID")} ${currency ?? "mata uang tidak diketahui"}`;
}

export function formatPercent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`;
}

/** Guards against drift between the UI filter tuple and the billing registry. */
export function operationFilterKeys(): readonly string[] {
	return Object.keys(CREDIT_OPERATION_REGISTRY);
}
