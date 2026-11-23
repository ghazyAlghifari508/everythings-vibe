import { describe, expect, it } from "vitest";
import type { AdminCreditUsageRow } from "../types/admin-credit";
import { adminCreditSearchSchema } from "../types/admin-credit";
import {
	creditOutcomeOf,
	creditStatesForStatus,
	formatDuration,
	formatMinorAmount,
	formatPercent,
	resolveDateWindow,
	toAdminCreditDetail,
} from "../utils/admin-credit-utils";

const baseRow: AdminCreditUsageRow = {
	id: "op_1",
	createdAt: "2026-01-10T10:00:00.000Z",
	userName: "Admin",
	userEmail: "admin@example.com",
	product: "studio",
	operation: "studio.generate",
	stage: "studio",
	state: "settled",
	resourceType: "studio_project",
	resourceLabel: "Design A",
	resourceId: "project_1",
	estimatedCredits: 4,
	reservedCredits: 4,
	finalCharge: 3,
	fundingSource: "subscription_balance",
	pricingVersion: "v1",
};

describe("admin credit search validation", () => {
	it("applies bounded defaults instead of accepting runaway pagination", () => {
		expect(adminCreditSearchSchema.parse({})).toMatchObject({
			tab: "usage",
			page: 1,
			pageSize: 20,
			product: "all",
			operation: "all",
			status: "all",
			fundingSource: "all",
			search: "",
		});
		expect(
			adminCreditSearchSchema.parse({ page: "999999", pageSize: "1000" }),
		).toMatchObject({ page: 1, pageSize: 20 });
	});

	it("accepts only date-shaped strings and allowlisted filters", () => {
		expect(
			adminCreditSearchSchema.parse({
				from: "2026-01-01",
				to: "2026-01-31",
				product: "studio",
				fundingSource: "subscription_balance",
			}),
		).toMatchObject({
			from: "2026-01-01",
			to: "2026-01-31",
			product: "studio",
			fundingSource: "subscription_balance",
		});
		expect(() =>
			adminCreditSearchSchema.parse({ from: "2026/01/01" }),
		).toThrow();
		expect(() =>
			adminCreditSearchSchema.parse({ product: "unknown_product" }),
		).not.toThrow();
		expect(
			adminCreditSearchSchema.parse({ product: "unknown_product" }).product,
		).toBe("all");
	});
});

describe("admin credit date window", () => {
	it("uses inclusive UTC day boundaries", () => {
		const window = resolveDateWindow("2026-01-10", "2026-01-10");
		expect(window.start?.toISOString()).toBe("2026-01-10T00:00:00.000Z");
		expect(window.end?.toISOString()).toBe("2026-01-10T23:59:59.999Z");
	});

	it("normalizes a reversed range and ignores invalid dates", () => {
		const reversed = resolveDateWindow("2026-02-01", "2026-01-01");
		expect(reversed.start?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(reversed.end?.toISOString()).toBe("2026-02-01T23:59:59.999Z");
		const invalid = resolveDateWindow("2026-99-99", "2026-01-01");
		expect(invalid.start).toBeNull();
		expect(invalid.end?.toISOString()).toBe("2026-01-01T23:59:59.999Z");
		expect(resolveDateWindow()).toEqual({ start: null, end: null });
	});
});

describe("admin credit outcome mapping", () => {
	it("maps terminal states without merging release into refund", () => {
		expect(creditStatesForStatus("all")).toEqual([]);
		expect(creditStatesForStatus("active")).toEqual([
			"reserved",
			"running",
			"settling",
		]);
		expect(creditOutcomeOf("settled")).toBe("success");
		expect(creditOutcomeOf("released")).toBe("partial");
		expect(creditOutcomeOf("failed")).toBe("failed");
		expect(creditOutcomeOf("refunded")).toBe("refunded");
		expect(creditOutcomeOf("quarantined")).toBe("quarantined");
		expect(creditOutcomeOf("running")).toBe("active");
	});
});

describe("admin credit detail projection", () => {
	it("exposes only allowlisted scalar fields", () => {
		const row = {
			...baseRow,
			prompt: "rawhiddenprompt",
			providerToken: "secret",
			headers: { authorization: "secret" },
		};
		const detail = toAdminCreditDetail(row);
		expect(Object.keys(detail).sort()).toEqual(
			[
				"id",
				"createdAt",
				"userEmail",
				"product",
				"operation",
				"stage",
				"state",
				"resourceLabel",
				"estimatedCredits",
				"reservedCredits",
				"finalCharge",
				"fundingSource",
				"pricingVersion",
			].sort(),
		);
		expect("prompt" in detail).toBe(false);
		expect("providerToken" in detail).toBe(false);
		expect("headers" in detail).toBe(false);
	});
});

describe("honest unmeasured formatting", () => {
	it("labels unavailable measurements instead of rendering zero", () => {
		expect(formatDuration(null)).toBe("Tidak diukur");
		expect(formatMinorAmount(null, "USD")).toBe("Tidak diketahui");
		expect(formatPercent(0)).toBe("0%");
	});
});
