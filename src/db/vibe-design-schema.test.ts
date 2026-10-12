import { describe, expect, it } from "vitest";
import {
	scrapeDocuments,
	scrapes,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "./schema";

describe("VibeDesign Schema Definitions", () => {
	it("defines scrapes and scrape_documents with text IDs", () => {
		expect(scrapes.id.dataType).toBe("string");
		expect(scrapes.userId.dataType).toBe("string");
		expect(scrapeDocuments.scrapeId.dataType).toBe("string");
	});

	it("defines studio_projects and studio_revisions with text IDs", () => {
		expect(studioProjects.id.dataType).toBe("string");
		expect(studioProjects.userId.dataType).toBe("string");
		expect(studioRevisions.projectId.dataType).toBe("string");
	});

	it("defines studio_jobs and studio_frames tables with required columns", () => {
		expect(studioJobs.id.dataType).toBe("string");
		expect(studioJobs.projectId.dataType).toBe("string");
		expect(studioJobs.userId.dataType).toBe("string");
		expect(studioJobs.status.dataType).toBe("string");
		expect(studioJobs.jobType.dataType).toBe("string");
		expect(studioFrames.id.dataType).toBe("string");
		expect(studioFrames.projectId.dataType).toBe("string");
		expect(studioFrames.name.dataType).toBe("string");
		expect(studioFrames.viewport.dataType).toBe("string");
		expect(studioFrames.status.dataType).toBe("string");
		expect(studioFrames.order.dataType).toBe("number");
	});

	it("supports canonical scrape statuses across pipeline lifecycle", () => {
		const expectedStatuses = [
			"queued",
			"capturing",
			"extracting",
			"generating",
			"saving",
			"completed",
			"failed",
		];
		expect(scrapes.status.enumValues).toEqual(expectedStatuses);
	});

	it("defines canonical scrape modes with design as default", () => {
		expect(scrapes.mode.enumValues).toEqual(["design", "html"]);
		expect(scrapes.mode.default).toBe("design");
	});
});
