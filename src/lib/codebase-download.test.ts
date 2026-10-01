// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	artifactMimeTypeFor,
	downloadArtifact,
	downloadJsonArtifact,
	downloadMarkdownArtifact,
} from "./codebase-download";

beforeEach(() => {
	if (!URL.createObjectURL) {
		URL.createObjectURL = vi.fn(() => "blob:mock-url") as unknown as (
			obj: Blob | MediaSource,
		) => string;
	}
	if (!URL.revokeObjectURL) {
		URL.revokeObjectURL = vi.fn() as unknown as (url: string) => void;
	}
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
		this: HTMLAnchorElement,
	) {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("artifactMimeTypeFor", () => {
	it("maps .json to application/json", () => {
		expect(artifactMimeTypeFor("feature-x.json")).toBe("application/json");
		expect(artifactMimeTypeFor("TASKS-X.JSON")).toBe("application/json");
	});

	it("maps .md and anything else to text/markdown", () => {
		expect(artifactMimeTypeFor("PRD-x.md")).toBe("text/markdown");
		expect(artifactMimeTypeFor("AC-x.MD")).toBe("text/markdown");
	});
});

describe("downloadArtifact", () => {
	it("triggers a real anchor download with file name and blob URL", () => {
		const ok = downloadArtifact({
			fileName: "PRD-x.md",
			content: "# Dokumen",
			mimeType: "text/markdown",
		});

		expect(ok).toBe(true);
		expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
		const click = vi.mocked(HTMLAnchorElement.prototype.click);
		expect(click).toHaveBeenCalledTimes(1);
	});

	it("serializes JSON artifacts as pretty-printed application/json", () => {
		const seen: Blob[] = [];
		vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
			seen.push(blob as Blob);
			return "blob:mock-url";
		});

		const ok = downloadJsonArtifact("feature-x.json", { a: 1 });

		expect(ok).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.type).toContain("application/json");
	});

	it("passes markdown content through as text/markdown", () => {
		const seen: Blob[] = [];
		vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
			seen.push(blob as Blob);
			return "blob:mock-url";
		});

		const ok = downloadMarkdownArtifact("AC-x.md", "## Kriteria");

		expect(ok).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.type).toContain("text/markdown");
	});
});
