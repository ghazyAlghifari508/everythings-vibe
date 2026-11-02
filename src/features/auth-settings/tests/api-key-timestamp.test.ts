import { expect, it } from "vitest";
import { apiKeys } from "@/db/schema";

it("round-trips expiry as UTC through the Drizzle timestamp mapping", () => {
	const expiry = new Date("2026-11-30T18:23:32.660Z");
	const serialized = apiKeys.expiresAt.mapToDriverValue(expiry);
	expect(serialized).toBe(expiry.toISOString());
	// PostgreSQL timestamp without timezone returns wall-clock text; Drizzle
	// interprets it as UTC, unlike node-postgres's default local Date parser.
	const returned = "2026-11-30 18:23:32.660";
	const parsed = apiKeys.expiresAt.mapFromDriverValue(returned);
	if (!(parsed instanceof Date)) throw new Error("Expected timestamp Date");
	expect(parsed.toISOString()).toBe(expiry.toISOString());
});
