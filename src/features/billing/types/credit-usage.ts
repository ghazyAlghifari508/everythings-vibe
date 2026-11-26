import type { CreditOperationStage, CreditOperationUsage } from "@/db/schema";
import type {
	CreditComplexityMetrics,
	CreditOperationKind,
	CreditOperationState,
	CreditPricingVersion,
} from "@/features/billing/services/adaptive-credit";
import type {
	CreditOperationFundingSource,
	CreditOperationProduct,
} from "@/features/billing/services/credit-operation-registry";

export interface CreditOperationItem {
	id: string;
	projectId: string | null;
	projectName?: string | null;
	product: CreditOperationProduct;
	fundingSource: CreditOperationFundingSource;
	resourceName?: string | null;
	resourceUrl?: string | null;
	kind: CreditOperationKind;
	stage: CreditOperationStage;
	state: CreditOperationState;
	estimatedCredits: number;
	reservedCredits: number;
	maximumCredits: number;
	finalCharge?: number | null;
	pricingVersion: CreditPricingVersion;
	metrics: CreditComplexityMetrics;
	usage?: CreditOperationUsage | null;
	capApplied: boolean;
	createdAt: string | null;
	settledAt?: string | null;
}

export interface CreditUsagePagination {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export interface PaginatedCreditUsageResult {
	items: CreditOperationItem[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface PaginatedCreditUsageInput {
	page?: number;
	pageSize?: number;
	stage?: string;
	status?: string;
	projectId?: string;
	product?: string;
	kind?: string;
}
