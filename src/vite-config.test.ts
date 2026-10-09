import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("vite optimizeDeps configuration", () => {
	it("includes @tanstack/react-store and use-sync-external-store/shim/with-selector for prebundling", () => {
		const include = config.optimizeDeps?.include ?? [];
		expect(include).toContain("@tanstack/react-store");
		expect(include).toContain("use-sync-external-store/shim/with-selector");
	});
});
