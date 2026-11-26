import { describe, expect, it } from "vitest";
import {
	type CreditMeterInput,
	resolveCreditMeter,
} from "../utils/credit-meter";

function input(overrides: Partial<CreditMeterInput> = {}): CreditMeterInput {
	return {
		allocation: 100,
		used: 0,
		reserved: 0,
		available: 100,
		...overrides,
	};
}

describe("credit meter threshold contract", () => {
	it.each([
		[0, "healthy"],
		[49, "healthy"],
		[50, "warning"],
		[84, "warning"],
		[85, "critical"],
		[99, "critical"],
	] as const)("maps %i%% usage to %s", (used, state) => {
		const meter = resolveCreditMeter(input({ used, available: 100 - used }));
		expect(meter.state).toBe(state);
		expect(meter.utilization).toBeCloseTo(used / 100);
	});

	it("marks a fully spent quota as exhausted", () => {
		const meter = resolveCreditMeter(input({ used: 100, available: 0 }));
		expect(meter.state).toBe("exhausted");
		expect(meter.message).toContain("Kredit periode ini habis");
	});

	it("marks zero allocation as exhausted instead of dividing by zero", () => {
		const meter = resolveCreditMeter(
			input({ allocation: 0, used: 0, reserved: 0, available: 0 }),
		);
		expect(meter.state).toBe("exhausted");
		expect(meter.utilization).toBe(0);
	});
});

describe("credit meter reservations", () => {
	it("counts reservations in utilization without calling them charged", () => {
		const meter = resolveCreditMeter(
			input({ allocation: 105, used: 80, reserved: 20, available: 5 }),
		);
		expect(meter.state).toBe("critical");
		expect(meter.available).toBe(5);
		expect(meter.reservedPercent).toBeCloseTo((20 / 105) * 100);
		expect(meter.usedPercent + meter.reservedPercent).toBeCloseTo(
			(100 / 105) * 100,
		);
		expect(meter.message).toContain("20 kredit lain sedang direservasi");
		expect(meter.message).not.toContain("permanen");
		expect(meter.label).toContain("20 direservasi");
	});

	it("restores available capacity immediately when a reservation is released", () => {
		const before = resolveCreditMeter(
			input({ allocation: 105, used: 80, reserved: 20, available: 5 }),
		);
		const after = resolveCreditMeter(
			input({ allocation: 105, used: 80, reserved: 0, available: 25 }),
		);
		expect(before.available).toBe(5);
		expect(after.available).toBe(25);
		expect(after.reservedPercent).toBe(0);
		expect(after.state).toBe("warning");
		expect(after.message).not.toContain("direservasi");
	});
});

describe("credit meter edge cases", () => {
	it("does not warn an exempt account about exhaustion", () => {
		const meter = resolveCreditMeter(
			input({ used: 100, reserved: 0, available: 0, exempt: true }),
		);
		expect(meter.state).toBe("exempt");
		expect(meter.message).toContain("Kredit tidak dipotong");
		expect(meter.message).not.toContain("habis");
	});

	it("treats an expired subscription as exhausted even with leftover credits", () => {
		const meter = resolveCreditMeter(
			input({ used: 80, reserved: 0, available: 0, paused: true }),
		);
		expect(meter.state).toBe("exhausted");
		expect(meter.message).toContain("Masa aktif habis");
	});

	it("keeps a loading state when canonical values are missing", () => {
		const meter = resolveCreditMeter(
			input({ allocation: undefined, used: undefined, available: undefined }),
		);
		expect(meter.state).toBe("loading");
		expect(meter.usedPercent).toBe(0);
		expect(meter.message).toContain("dimuat");
	});

	it("clamps over-allocation display while preserving the raw numbers", () => {
		const meter = resolveCreditMeter(
			input({ used: 120, reserved: 10, available: -30 }),
		);
		expect(meter.used).toBe(120);
		expect(meter.reserved).toBe(10);
		expect(meter.available).toBe(0);
		expect(meter.usedPercent).toBe(100);
		expect(meter.reservedPercent).toBe(0);
		expect(meter.inconsistent).toBe(true);
		expect(meter.label).toContain("120 / 100");
	});

	it("sanitizes negative counters and flags them for review", () => {
		const meter = resolveCreditMeter(
			input({ used: -5, reserved: -2, available: 107 }),
		);
		expect(meter.used).toBe(0);
		expect(meter.reserved).toBe(0);
		expect(meter.inconsistent).toBe(true);
	});

	it("rejects non-finite values instead of rendering a broken width", () => {
		const meter = resolveCreditMeter(
			input({ allocation: Number.NaN, used: Number.POSITIVE_INFINITY }),
		);
		expect(meter.state).toBe("loading");
	});
	it("recalculates the threshold after the quota changes", () => {
		const before = resolveCreditMeter(
			input({ allocation: 100, used: 85, reserved: 0, available: 15 }),
		);
		const after = resolveCreditMeter(
			input({ allocation: 130, used: 85, reserved: 0, available: 45 }),
		);
		expect(before.state).toBe("critical");
		expect(after.state).toBe("warning");
		expect(after.allocation).toBe(130);
	});
});
