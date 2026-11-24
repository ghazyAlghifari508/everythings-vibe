import { describe, expect, it } from "vitest";
import {
	resolveStudioDevtoolsConfig,
	STUDIO_SOURCE_INSPECTOR_ENV,
} from "@/lib/devtools-policy";

describe("P11 development source inspector boundary", () => {
	it("keeps source injection opt-in during ordinary development", () => {
		const config = resolveStudioDevtoolsConfig({});
		expect(config.injectSource.enabled).toBe(false);
	});

	it("enables source injection only with the explicit opt-in value", () => {
		expect(
			resolveStudioDevtoolsConfig({ [STUDIO_SOURCE_INSPECTOR_ENV]: "1" })
				.injectSource.enabled,
		).toBe(true);
		expect(
			resolveStudioDevtoolsConfig({ [STUDIO_SOURCE_INSPECTOR_ENV]: "true" })
				.injectSource.enabled,
		).toBe(false);
	});

	it("strips devtools from production builds even when source inspection is enabled", () => {
		const config = resolveStudioDevtoolsConfig({
			[STUDIO_SOURCE_INSPECTOR_ENV]: "1",
		});
		expect(config.removeDevtoolsOnBuild).toBe(true);
	});

	it("does not pipe the console into the development terminal", () => {
		expect(resolveStudioDevtoolsConfig({}).consolePiping.enabled).toBe(false);
	});
});
