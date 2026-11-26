/**
 * Presentation contract for the billing credit meter. Pure and framework-free
 * so thresholds are testable without a DOM or database.
 *
 * `available` must come from the canonical billing service
 * (getCreditBalance -> resolveSubscriptionState), never from a view-only
 * subtraction. Reserved credits lower availability but are not a charge.
 */

export const CREDIT_METER_THRESHOLDS = {
	warning: 0.5,
	critical: 0.85,
} as const;

export type CreditMeterState =
	| "loading"
	| "exempt"
	| "healthy"
	| "warning"
	| "critical"
	| "exhausted";

export type CreditMeterTone = "neutral" | "success" | "warning" | "danger";

export interface CreditMeterInput {
	allocation?: number | null;
	used?: number | null;
	reserved?: number | null;
	/** Canonical remaining capacity from getCreditBalance. */
	available?: number | null;
	exempt?: boolean;
	/** Expired paid period: leftovers are forfeited, remaining is forced to 0. */
	paused?: boolean;
}

export interface CreditMeterView {
	state: CreditMeterState;
	tone: CreditMeterTone;
	allocation: number;
	used: number;
	reserved: number;
	available: number;
	/** Raw utilization including reservations, clamped only for the bar width. */
	utilization: number;
	usedPercent: number;
	reservedPercent: number;
	inconsistent: boolean;
	/** Accessible value text. Carries the raw numbers, including inconsistencies. */
	label: string;
	message: string;
}

function finiteOrNull(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function toneFor(state: CreditMeterState): CreditMeterTone {
	switch (state) {
		case "healthy":
		case "exempt":
			return "success";
		case "warning":
			return "warning";
		case "critical":
		case "exhausted":
			return "danger";
		default:
			return "neutral";
	}
}

export function resolveCreditMeter(input: CreditMeterInput): CreditMeterView {
	const rawAllocation = finiteOrNull(input.allocation);
	const rawUsed = finiteOrNull(input.used);
	const rawReserved = finiteOrNull(input.reserved);
	const rawAvailable = finiteOrNull(input.available);

	if (
		rawAllocation === null ||
		rawUsed === null ||
		rawReserved === null ||
		rawAvailable === null
	) {
		return {
			state: "loading",
			tone: "neutral",
			allocation: 0,
			used: 0,
			reserved: 0,
			available: 0,
			utilization: 0,
			usedPercent: 0,
			reservedPercent: 0,
			inconsistent: false,
			label: "Kredit sedang dimuat, belum tersedia",
			message: "Data kredit sedang dimuat.",
		};
	}

	const allocation = Math.max(0, rawAllocation);
	const used = Math.max(0, rawUsed);
	const reserved = Math.max(0, rawReserved);
	const available = Math.max(0, rawAvailable);
	const inconsistent =
		rawAllocation < 0 ||
		rawUsed < 0 ||
		rawReserved < 0 ||
		rawAvailable < 0 ||
		used + reserved > allocation;

	const utilization =
		allocation > 0 ? clamp((used + reserved) / allocation, 0, 1) : 0;
	const usedPercent =
		allocation > 0 ? clamp((used / allocation) * 100, 0, 100) : 0;
	const reservedPercent =
		allocation > 0
			? clamp((reserved / allocation) * 100, 0, 100 - usedPercent)
			: 0;

	let state: CreditMeterState;
	if (input.exempt) {
		state = "exempt";
	} else if (input.paused || available <= 0) {
		state = "exhausted";
	} else if (utilization >= CREDIT_METER_THRESHOLDS.critical) {
		state = "critical";
	} else if (utilization >= CREDIT_METER_THRESHOLDS.warning) {
		state = "warning";
	} else {
		state = "healthy";
	}

	const reservationNote =
		reserved > 0
			? ` ${reserved} kredit lain sedang direservasi, belum dipotong.`
			: "";

	const messages: Record<CreditMeterState, string> = {
		loading: "Data kredit sedang dimuat.",
		exempt: "Akun bebas biaya. Kredit tidak dipotong.",
		healthy: `Sisa ${available} kredit periode ini.${reservationNote} Kredit reset setiap 30 hari.`,
		warning: `Sisa ${available} kredit periode ini.${reservationNote} Kredit reset setiap 30 hari.`,
		critical: `Kredit hampir habis. Tersisa ${available} kredit.${reservationNote}`,
		exhausted: input.paused
			? "Masa aktif habis. Sisa kredit periode lama hangus. Perpanjang untuk dapat kredit segar."
			: `Kredit periode ini habis. Perpanjang atau tunggu reset berikutnya.${reservationNote}`,
	};

	const stateLabels: Record<CreditMeterState, string> = {
		loading: "belum tersedia",
		exempt: "kredit tidak dibatasi",
		healthy: "kredit mencukupi",
		warning: "penggunaan sekitar setengah",
		critical: "kredit hampir habis",
		exhausted: "tidak ada kredit yang bisa dipakai",
	};

	return {
		state,
		tone: toneFor(state),
		allocation,
		used,
		reserved,
		available,
		utilization,
		usedPercent,
		reservedPercent,
		inconsistent,
		label: `Kredit digunakan ${used} / ${allocation}, ${reserved} direservasi, sisa ${available} kredit. ${stateLabels[state]}.`,
		message: `${messages[state]}${inconsistent ? " Angka kredit perlu diperiksa." : ""}`,
	};
}
