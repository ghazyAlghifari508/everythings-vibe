import { resolveConfig } from "vite";
import { describe, expect, it, vi } from "vitest";

describe("vite optimizeDeps configuration", () => {
	it("includes transitive arrow chains from root dep for prebundling", async () => {
		const config = await resolveConfig({}, "serve");
		const include = config.optimizeDeps.include ?? [];
		expect(include).toContain("@tanstack/react-router > @tanstack/react-store");
		expect(include).toContain(
			"@tanstack/react-router > @tanstack/react-store > use-sync-external-store/shim/with-selector",
		);
	});
});

describe("source inspector registration", () => {
	it.each([
		{
			command: "serve",
			mode: "development",
			preview: false,
			flag: "0",
			active: false,
		},
		{
			command: "serve",
			mode: "development",
			preview: false,
			flag: "1",
			active: true,
		},
		{
			command: "serve",
			mode: "development",
			preview: true,
			flag: "1",
			active: false,
		},
		{
			command: "build",
			mode: "production",
			preview: false,
			flag: "1",
			active: false,
		},
		{
			command: "build",
			mode: "development",
			preview: false,
			flag: "1",
			active: false,
		},
	] as const)("$command/$mode (preview=$preview, flag=$flag) enables source transform: $active", async ({
		command,
		mode,
		preview,
		flag,
		active,
	}) => {
		vi.stubEnv("VITE_ENABLE_STUDIO_SOURCE_INSPECTOR", flag);
		try {
			const resolved = await resolveConfig(
				{},
				command,
				mode,
				"production",
				preview,
			);
			const plugins = resolved.plugins.map((plugin) => plugin.name);
			expect(plugins.includes("@tanstack/devtools:inject-source")).toBe(active);
			if (command === "build")
				expect(plugins).toContain(
					"@tanstack/devtools:remove-devtools-on-build",
				);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
