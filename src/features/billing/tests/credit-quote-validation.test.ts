import { describe, expect, it } from "vitest";
import type { CreditQuote } from "../services/adaptive-credit";
import { validateQuote } from "../services/credit-guards";

const metrics = {
	studio: { frames: 3, promptChars: 120, designMdChars: 0 },
};

const authoritative: CreditQuote = {
	operation: "studio.generate",
	pricingVersion: "synthetic-v1",
	estimatedCredits: 6,
	maximumCredits: 8,
	metrics,
};

describe("server-authoritative credit quote validation", () => {
	it("accepts a quote matching the server-computed tariff quote", () => {
		expect(() =>
			validateQuote(authoritative, "studio.generate", metrics, authoritative),
		).not.toThrow();
	});

	it("rejects a tampered estimate even with the right operation", () => {
		expect(() =>
			validateQuote(
				{ ...authoritative, estimatedCredits: 1 },
				"studio.generate",
				metrics,
				authoritative,
			),
		).toThrow("Credit quote does not match server pricing");
	});

	it("rejects a quote for a different operation or scope", () => {
		expect(() =>
			validateQuote(authoritative, "studio.revise", metrics, authoritative),
		).toThrow("Credit quote does not match server pricing");
		expect(() =>
			validateQuote(
				authoritative,
				"studio.generate",
				{ studio: { frames: 99, promptChars: 120 } },
				authoritative,
			),
		).toThrow("Credit quote does not match server pricing");
	});

	it("keeps the unconfigured production tariff closed", () => {
		expect(() =>
			validateQuote(authoritative, "studio.generate", metrics),
		).toThrow();
	});
});
