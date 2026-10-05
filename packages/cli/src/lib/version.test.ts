import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CODEBASE_CLI_VERSION, compareCliVersions } from "./sync-client.js";
import { CLI_VERSION } from "./version.js";

describe("CLI version single source", () => {
	it("matches the package.json version field", () => {
		const require = createRequire(import.meta.url);
		const pkg = require("../../package.json") as { version: string };
		expect(CLI_VERSION).toBe(pkg.version);
		expect(CODEBASE_CLI_VERSION).toBe(pkg.version);
		expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("is distinguishable from the pre-capability 3.0.0 binary", () => {
		// 3.0.0 shipped both with and without the repositoryName handshake and
		// the canonical ignore behavior, so version equality proved nothing.
		// The bumped source version must sort strictly newer.
		expect(compareCliVersions(CLI_VERSION, "3.0.0")).toBeGreaterThan(0);
	});
});
