import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("vite optimizeDeps configuration", () => {
	it("includes transitive arrow chains from root dep for prebundling", () => {
		const include = config.optimizeDeps?.include ?? [];
		expect(include).toContain("@tanstack/react-router > @tanstack/react-store");
		expect(include).toContain(
			"@tanstack/react-router > @tanstack/react-store > use-sync-external-store/shim/with-selector",
		);
	});
});
