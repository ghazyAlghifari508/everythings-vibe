import { describe, expect, it } from "vitest";
import { resolveFailedAtStage } from "./scrape-job-service";

describe("resolveFailedAtStage", () => {
	it("keeps a real processing stage the run was last seen in", () => {
		expect(resolveFailedAtStage("capturing")).toBe("capturing");
		expect(resolveFailedAtStage("extracting")).toBe("extracting");
		expect(resolveFailedAtStage("generating")).toBe("generating");
		expect(resolveFailedAtStage("saving")).toBe("saving");
		expect(resolveFailedAtStage("queued")).toBe("queued");
	});

	it("never reports a terminal stage as the failure stage", () => {
		expect(resolveFailedAtStage("completed")).toBe("queued");
		expect(resolveFailedAtStage("failed")).toBe("queued");
	});

	it("falls back to the first stage every job reached when the stage is unknown", () => {
		expect(resolveFailedAtStage(undefined)).toBe("queued");
	});
});
