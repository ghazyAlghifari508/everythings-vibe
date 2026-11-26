import type { CreditOperationKind } from "@/features/billing/services/credit-operation-registry";

export type TariffBillingUnit =
	| "frame"
	| "page"
	| "design_view"
	| "image"
	| "request"
	| "megabyte";
export type TariffOutcome = "success" | "partial" | "failed" | "cancelled";
export type OutcomeSettlement = "completed_units" | "no_charge";
export type TariffRounding = "ceil" | "floor" | "round";

export interface AdaptiveTariff {
	mode: "adaptive";
	version: string;
	billingUnit: TariffBillingUnit;
	creditsPerUnit: number;
	minimumCredits: number;
	maximumCredits: number;
	rounding: TariffRounding;
	settlement: Record<TariffOutcome, OutcomeSettlement>;
}

export interface FixedTariff {
	mode: "fixed";
	version: string;
	credits: number;
	/** Every key must be measured before a fixed price may be quoted. */
	verifiedLimits: Readonly<Record<string, number>>;
	settlement: Record<TariffOutcome, OutcomeSettlement>;
}

export type Tariff = AdaptiveTariff | FixedTariff;

export interface TariffRegistryInput {
	id: string;
	tariffs: Partial<Record<CreditOperationKind, Record<string, Tariff>>>;
	activeVersions: Partial<Record<CreditOperationKind, string>>;
}

export interface TariffRegistry {
	readonly id: string;
	readonly tariffs: Readonly<TariffRegistryInput["tariffs"]>;
	readonly activeVersions: Readonly<TariffRegistryInput["activeVersions"]>;
}

export interface TariffQuote {
	operation: CreditOperationKind;
	version: string;
	mode: Tariff["mode"];
	billingUnit: TariffBillingUnit | null;
	estimatedCredits: number;
	maximumCredits: number;
}

export interface TariffSettlement {
	operation: CreditOperationKind;
	version: string;
	chargedCredits: number;
	maximumCredits: number;
	unitsUsed: number;
}

export interface TariffQuoteInput {
	operation: CreditOperationKind;
	/** Pin a previously accepted version instead of using the active one. */
	version?: string;
	requestedUnits?: Readonly<Partial<Record<TariffBillingUnit, number>>>;
	limitMetrics?: Readonly<Record<string, number>>;
}

export interface TariffSettlementInput {
	operation: CreditOperationKind;
	/** The version returned by the accepted quote. Never looked up by default. */
	version: string;
	outcome: TariffOutcome;
	authorizedMaximum: number;
	measuredUnits?: Readonly<Partial<Record<TariffBillingUnit, number>>>;
	limitMetrics?: Readonly<Record<string, number>>;
}

export class TariffError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.code = code;
		this.name = new.target.name;
	}
}

export class TariffDefinitionError extends TariffError {
	constructor(message: string) {
		super("TARIFF_DEFINITION_INVALID", message);
	}
}

export class TariffInputError extends TariffError {
	constructor(message: string) {
		super("TARIFF_INPUT_INVALID", message);
	}
}

export class TariffNotConfiguredError extends TariffError {
	readonly operation: CreditOperationKind;

	constructor(operation: CreditOperationKind) {
		super("TARIFF_NOT_CONFIGURED", `No tariff is configured for ${operation}`);
		this.operation = operation;
	}
}

export class TariffVersionNotFoundError extends TariffError {
	readonly operation: CreditOperationKind;
	readonly version: string;

	constructor(operation: CreditOperationKind, version: string) {
		super(
			"TARIFF_VERSION_NOT_FOUND",
			`Tariff version ${version} is unavailable for ${operation}`,
		);
		this.operation = operation;
		this.version = version;
	}
}

export class TariffLimitError extends TariffError {
	readonly limitKey: string;

	constructor(kind: "missing" | "exceeded", limitKey: string) {
		super(
			kind === "missing" ? "TARIFF_LIMIT_MISSING" : "TARIFF_LIMIT_EXCEEDED",
			`Verified tariff limit ${limitKey} is ${kind}`,
		);
		this.limitKey = limitKey;
	}
}
