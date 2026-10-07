import { describe, expect, it } from "vitest";
import {
	scrapeDocuments,
	scrapes,
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
});

