// Dormant, dependency-free tariff engine for the TASK 09 proposal.
// It holds no prices: callers supply versioned tariffs explicitly. No
// production credit path imports this module while approval is pending.
import type { CreditOperationKind } from "@/features/billing/services/credit-operation-registry";

export type TariffBillingUnit =
	| "frame"
	| "page"
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

const BILLING_UNITS: readonly TariffBillingUnit[] = [
	"frame",
	"page",
	"image",
	"request",
	"megabyte",
];
const ROUNDING_MODES: readonly TariffRounding[] = ["ceil", "floor", "round"];
const SETTLEMENT_POLICIES: readonly OutcomeSettlement[] = [
	"completed_units",
	"no_charge",
];
const OUTCOMES: readonly TariffOutcome[] = [
	"success",
	"partial",
	"failed",
	"cancelled",
];

function assertPositiveFinite(value: number, label: string): void {
	if (!Number.isFinite(value) || value <= 0)
		throw new TariffDefinitionError(
			`${label} must be a positive finite number`,
		);
}

function assertCredits(value: number, label: string, minimum: number): void {
	if (!Number.isInteger(value) || value < minimum)
		throw new TariffDefinitionError(
			`${label} must be an integer greater than or equal to ${minimum}`,
		);
}

function validateTariff(versionKey: string, tariff: Tariff): void {
	if (!versionKey || tariff.version !== versionKey)
		throw new TariffDefinitionError(
			"Tariff version must match its registry key",
		);

	if (tariff.mode === "fixed") {
		assertCredits(tariff.credits, `Fixed credits for ${versionKey}`, 1);
		const limits = Object.entries(tariff.verifiedLimits);
		if (limits.length === 0)
			throw new TariffDefinitionError(
				`Fixed tariff ${versionKey} needs verified resource limits`,
			);
		for (const [key, maximum] of limits)
			assertPositiveFinite(maximum, `Verified limit ${key}`);
		for (const outcome of OUTCOMES) {
			if (!SETTLEMENT_POLICIES.includes(tariff.settlement[outcome]))
				throw new TariffDefinitionError(
					`Unsupported ${outcome} settlement for ${versionKey}`,
				);
		}
		return;
	}

	if (!BILLING_UNITS.includes(tariff.billingUnit))
		throw new TariffDefinitionError(
			`Unsupported billing unit ${tariff.billingUnit}`,
		);
	assertPositiveFinite(
		tariff.creditsPerUnit,
		`Credits per unit for ${versionKey}`,
	);
	assertCredits(tariff.minimumCredits, `Minimum credits for ${versionKey}`, 0);
	assertCredits(tariff.maximumCredits, `Maximum credits for ${versionKey}`, 1);
	if (tariff.minimumCredits > tariff.maximumCredits)
		throw new TariffDefinitionError(
			`Minimum exceeds maximum credits for ${versionKey}`,
		);
	if (!ROUNDING_MODES.includes(tariff.rounding))
		throw new TariffDefinitionError(`Unsupported rounding ${tariff.rounding}`);
	for (const outcome of OUTCOMES) {
		if (!SETTLEMENT_POLICIES.includes(tariff.settlement[outcome]))
			throw new TariffDefinitionError(
				`Unsupported ${outcome} settlement for ${versionKey}`,
			);
	}
}

export function createTariffRegistry(
	input: TariffRegistryInput,
): TariffRegistry {
	if (!input.id.trim())
		throw new TariffDefinitionError("A tariff registry needs an id");

	const tariffEntries = Object.entries(input.tariffs).flatMap(
		([operation, versions]): ReadonlyArray<
			readonly [string, Record<string, Tariff>]
		> => (versions ? [[operation, versions]] : []),
	);
	const tariffsByOperation = new Map(tariffEntries);
	const pinnedOperations = new Set(Object.keys(input.activeVersions));

	for (const [operation, versions] of tariffEntries) {
		if (Object.keys(versions).length === 0)
			throw new TariffDefinitionError(
				`Operation ${operation} has no tariff versions`,
			);
		if (!pinnedOperations.has(operation))
			throw new TariffDefinitionError(
				`Operation ${operation} must pin an active tariff version`,
			);
		for (const [version, tariff] of Object.entries(versions))
			validateTariff(version, tariff);
	}

	for (const [operation, version] of Object.entries(input.activeVersions)) {
		if (!version || !tariffsByOperation.get(operation)?.[version])
			throw new TariffDefinitionError(
				`Active tariff ${version} is missing for ${operation}`,
			);
	}

	return {
		id: input.id,
		tariffs: input.tariffs,
		activeVersions: input.activeVersions,
	};
}

function resolveTariff(
	registry: TariffRegistry,
	operation: CreditOperationKind,
	explicitVersion?: string,
): { tariff: Tariff; version: string } {
	const versions = registry.tariffs[operation];
	if (!versions) throw new TariffNotConfiguredError(operation);
	const version = explicitVersion ?? registry.activeVersions[operation];
	if (!version) throw new TariffNotConfiguredError(operation);
	const tariff = versions[version];
	if (!tariff) throw new TariffVersionNotFoundError(operation, version);
	return { tariff, version };
}

function unitsOf(
	units: Readonly<Partial<Record<TariffBillingUnit, number>>> | undefined,
	billingUnit: TariffBillingUnit,
): number {
	const value = units?.[billingUnit] ?? 0;
	if (!Number.isFinite(value) || value < 0)
		throw new TariffInputError(
			`${billingUnit} units must be finite and non-negative`,
		);
	return value;
}

function verifyLimits(
	limits: Readonly<Record<string, number>>,
	metrics: Readonly<Record<string, number>> | undefined,
): void {
	for (const [key, maximum] of Object.entries(limits)) {
		const used = metrics?.[key];
		if (used === undefined || !Number.isFinite(used) || used < 0)
			throw new TariffLimitError("missing", key);
		if (used > maximum) throw new TariffLimitError("exceeded", key);
	}
}

function roundCredits(value: number, rounding: TariffRounding): number {
	if (rounding === "floor") return Math.floor(value);
	if (rounding === "round") return Math.round(value);
	return Math.ceil(value);
}

function adaptiveCharge(
	tariff: AdaptiveTariff,
	units: number,
	outcome: TariffOutcome,
	authorizedMaximum: number,
): number {
	if (units === 0 || tariff.settlement[outcome] === "no_charge") return 0;
	const rounded = roundCredits(units * tariff.creditsPerUnit, tariff.rounding);
	const bounded = Math.min(
		tariff.maximumCredits,
		Math.max(tariff.minimumCredits, rounded),
	);
	return Math.min(bounded, Math.max(0, Math.floor(authorizedMaximum)));
}

export function quoteTariff(
	registry: TariffRegistry,
	input: TariffQuoteInput,
): TariffQuote {
	const { tariff, version } = resolveTariff(
		registry,
		input.operation,
		input.version,
	);
	if (tariff.mode === "fixed") {
		verifyLimits(tariff.verifiedLimits, input.limitMetrics);
		return {
			operation: input.operation,
			version,
			mode: "fixed",
			billingUnit: null,
			estimatedCredits: tariff.credits,
			maximumCredits: tariff.credits,
		};
	}
	return {
		operation: input.operation,
		version,
		mode: "adaptive",
		billingUnit: tariff.billingUnit,
		estimatedCredits: adaptiveCharge(
			tariff,
			unitsOf(input.requestedUnits, tariff.billingUnit),
			"success",
			tariff.maximumCredits,
		),
		maximumCredits: tariff.maximumCredits,
	};
}

export function calculateTariffSettlement(
	registry: TariffRegistry,
	input: TariffSettlementInput,
): TariffSettlement {
	if (!input.version)
		throw new TariffVersionNotFoundError(input.operation, input.version);
	if (!Number.isFinite(input.authorizedMaximum) || input.authorizedMaximum < 0)
		throw new TariffInputError(
			"Authorized maximum must be finite and non-negative",
		);

	const { tariff, version } = resolveTariff(
		registry,
		input.operation,
		input.version,
	);
	const authorizedMaximum = Math.floor(input.authorizedMaximum);
	if (tariff.mode === "fixed") {
		verifyLimits(tariff.verifiedLimits, input.limitMetrics);
		const chargeable = tariff.settlement[input.outcome] === "completed_units";
		return {
			operation: input.operation,
			version,
			chargedCredits: chargeable
				? Math.min(tariff.credits, authorizedMaximum)
				: 0,
			maximumCredits: tariff.credits,
			unitsUsed: 0,
		};
	}

	const unitsUsed = unitsOf(input.measuredUnits, tariff.billingUnit);
	return {
		operation: input.operation,
		version,
		chargedCredits: adaptiveCharge(
			tariff,
			unitsUsed,
			input.outcome,
			authorizedMaximum,
		),
		maximumCredits: tariff.maximumCredits,
		unitsUsed,
	};
}
