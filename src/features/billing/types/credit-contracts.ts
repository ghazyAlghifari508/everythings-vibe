import type { CreditOperationStage } from "@/db/schema";
import type {
	CreditComplexityMetrics,
	CreditLedgerEntryType,
	CreditOperationKind,
	CreditOperationState,
	CreditQuote,
} from "@/features/billing/services/adaptive-credit";

export {
	type BuildAcMetricsInput,
	type BuildCodebaseMetricsInput,
	type BuildPrdMetricsInput,
	type BuildTaskMetricsInput,
	buildAcMetrics,
	buildCodebaseMetrics,
	buildPrdMetrics,
	buildTaskMetrics,
	formatInsufficientCreditsError,
	formatSubscriptionPausedError,
} from "@/features/billing/services/adaptive-credit";

export interface CreditSubscription {
	id: string;
	userId: string;
	credits: number;
	creditsUsed: number;
	creditsReserved: number;
	currentPeriodEnd: Date | null;
}

export interface CreditProject {
	id: string;
	userId: string;
}

export interface CreditOperation {
	id: string;
	userId: string;
	projectId: string;
	subscriptionId: string | null;
	kind: CreditOperationKind;
	stage: CreditOperationStage;
	idempotencyKey: string;
	state: CreditOperationState;
	estimatedCredits: number;
	reservedCredits: number;
	maximumCredits: number;
	finalCharge: number | null;
	pricingVersion: CreditQuote["pricingVersion"];
	metrics: CreditQuote["metrics"];
	usage?: { measuredUnits: number };
	capApplied: boolean;
	reconciliation?: {
		status: "not_required" | "pending" | "resolved";
		code?: string;
		accounting?: "none" | "manual_correction_required";
		resolvedAt?: string;
	};
	artifactReference: string | null;
	failureReason: string | null;
	expiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreditLedgerEntry {
	id: string;
	userId: string;
	operationId: string | null;
	amount: number;
	entryType: CreditLedgerEntryType;
	reason: string;
	pricingVersion: CreditQuote["pricingVersion"];
	metadata?: {
		reconciliationCode?: string;
		accounting?: "manual_correction_required";
	};
	createdAt: Date;
}

export interface CreditServiceStore {
	subscriptions: Map<string, CreditSubscription>;
	projects: Map<string, CreditProject>;
	operations: Map<string, CreditOperation>;
	ledger: CreditLedgerEntry[];
}

export interface CreditQuoteInput {
	userId: string;
	projectId: string;
	operation: CreditOperationKind;
	stage: CreditOperationStage;
	metrics: CreditQuote["metrics"];
}

export interface ReserveCreditOperationInput {
	userId: string;
	projectId: string;
	stage: CreditOperationStage;
	operation: CreditOperationKind;
	metrics: CreditQuote["metrics"];
	idempotencyKey: string;
	quote: CreditQuote;
	expiresAt?: Date;
}

export interface SettleCreditOperationInput {
	userId: string;
	operationId: string;
	artifactReference?: string;
	artifactId?: string;
	finalCharge?: number;
	measuredUnits?: number;
	actualMetrics?: CreditComplexityMetrics;
}

export interface CreditOperationResult {
	id: string;
	state: CreditOperationState;
	finalCharge: number | null;
}

export type CreditSubscriptionOriginErrorCode =
	| "unresolved"
	| "missing"
	| "ownership_mismatch"
	| "invalid_period";

export class CreditSubscriptionOriginError extends Error {
	readonly code: CreditSubscriptionOriginErrorCode;

	constructor(code: CreditSubscriptionOriginErrorCode) {
		super(`Credit operation subscription origin is ${code}`);
		this.name = "CreditSubscriptionOriginError";
		this.code = code;
	}
}

export type CreditOperationLifecycle = "active" | "terminal";
