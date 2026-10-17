import type { CreditOperationStage } from "@/db/schema";
import type {
	CreditComplexityMetrics,
	CreditOperationKind,
	CreditOperationState,
	CreditPricingVersion,
} from "@/features/billing/services/adaptive-credit";

export interface CreditOperationItem {
	id: string;
	projectId: string;
	projectName?: string | null;
	kind: CreditOperationKind;
	stage: CreditOperationStage;
	state: CreditOperationState;
	estimatedCredits: number;
	reservedCredits: number;
	maximumCredits: number;
	finalCharge?: number | null;
	pricingVersion: CreditPricingVersion;
	metrics: CreditComplexityMetrics;
	capApplied: boolean;
	createdAt: string | null;
	settledAt?: string | null;
}
