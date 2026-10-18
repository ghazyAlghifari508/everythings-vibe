import { describe, expect, it } from "vitest";
import { parseProfileUpdate } from "@/features/auth-settings/services/profile";
import { PROFILE_MAX_NAME_CHARS } from "@/features/auth-settings/types/settings-constants";

describe("parseProfileUpdate", () => {
	it("accepts a bounded name with a known role", () => {
		expect(
			parseProfileUpdate({ fullName: "<sample name>", role: "developer" }),
		).toEqual({ fullName: "<sample name>", role: "developer" });
	});

	it("rejects missing, non-string, or oversized names", () => {
		for (const fullName of [undefined, null, "", "   ", 123, {}]) {
			expect(() => parseProfileUpdate({ fullName, role: "pm" })).toThrow();
		}
		expect(() =>
			parseProfileUpdate({
				fullName: "x".repeat(PROFILE_MAX_NAME_CHARS + 1),
				role: "pm",
			}),
		).toThrow();
	});

	it("rejects unknown or non-string roles", () => {
		for (const role of [undefined, null, "", "user", "admin", 123, {}]) {
			expect(() =>
				parseProfileUpdate({ fullName: "<sample name>", role }),
			).toThrow();
		}
	});
});
