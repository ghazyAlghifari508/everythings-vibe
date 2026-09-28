import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mintApiKey } from "./api-key-mint";

describe("mintApiKey", () => {
	// The raw key is shown once in Settings and pasted into a user's config, so
	// it must not carry the retired brand.
	it("mints keys under the current product prefix", () => {
		const { rawKey } = mintApiKey();

		expect(rawKey.startsWith("vibe_")).toBe(true);
		expect(rawKey).not.toContain("prdfy");
	});

	it("keeps a secret sample inside the stored, non-secret label", () => {
		const { rawKey, keyPrefix } = mintApiKey();

		expect(keyPrefix).toBe(rawKey.slice(0, 10));
		// A pure brand truncation would identify nothing.
		expect(keyPrefix).not.toBe(rawKey.slice(0, rawKey.indexOf("_") + 1));
	});

	it("persists only the hash, never the raw key", () => {
		const { rawKey, keyHash } = mintApiKey();

		expect(keyHash).toBe(createHash("sha256").update(rawKey).digest("hex"));
		expect(keyHash).not.toContain(rawKey);
		expect(keyHash).toHaveLength(64);
	});

	it("mints a distinct secret every time", () => {
		const keys = new Set(Array.from({ length: 8 }, () => mintApiKey().rawKey));

		expect(keys.size).toBe(8);
	});

	it("uses 32 bytes of entropy, hex encoded", () => {
		const { rawKey } = mintApiKey();
		const [prefix, ...rest] = rawKey.split("_");

		expect(prefix).toBe("vibe");
		expect(rest.join("")).toMatch(/^[0-9a-f]{64}$/);
	});
});
