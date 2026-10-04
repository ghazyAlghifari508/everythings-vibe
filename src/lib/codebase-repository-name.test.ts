import { describe, expect, it } from "vitest";
import { normalizeRepositoryName } from "./codebase-library";

describe("normalizeRepositoryName", () => {
	it("accepts a plain repository folder name", () => {
		expect(normalizeRepositoryName("react-movie-app")).toBe("react-movie-app");
		expect(normalizeRepositoryName("clipperbintang")).toBe("clipperbintang");
		expect(normalizeRepositoryName("my-saas")).toBe("my-saas");
	});

	it("accepts underscores and dots inside a single name segment", () => {
		expect(normalizeRepositoryName("web_app")).toBe("web_app");
		expect(normalizeRepositoryName("project.v2")).toBe("project.v2");
	});

	it("accepts non-ASCII names without mangling them", () => {
		expect(normalizeRepositoryName("proyek刀-2026")).toBe("proyek刀-2026");
	});

	it("trims surrounding whitespace before returning the name", () => {
		expect(normalizeRepositoryName("  react-movie-app  ")).toBe(
			"react-movie-app",
		);
	});

	it("rejects an absolute Windows path so no local root can reach the display name", () => {
		expect(normalizeRepositoryName("C:\\Coding\\project")).toBeNull();
		expect(normalizeRepositoryName("C:/Coding/project")).toBeNull();
	});

	it("rejects an absolute POSIX path", () => {
		expect(normalizeRepositoryName("/home/user/project")).toBeNull();
	});

	it("rejects a UNC path", () => {
		expect(normalizeRepositoryName("\\\\share\\project")).toBeNull();
	});

	it("rejects relative traversal and bare dot segments", () => {
		expect(normalizeRepositoryName("../project")).toBeNull();
		expect(normalizeRepositoryName("..\\project")).toBeNull();
		expect(normalizeRepositoryName(".")).toBeNull();
		expect(normalizeRepositoryName("..")).toBeNull();
	});

	it("rejects a nested path that is not a single name segment", () => {
		expect(normalizeRepositoryName("parent/child")).toBeNull();
	});

	it("rejects an empty or whitespace-only name", () => {
		expect(normalizeRepositoryName("")).toBeNull();
		expect(normalizeRepositoryName("   ")).toBeNull();
	});

	it("rejects control characters embedded in a name", () => {
		expect(normalizeRepositoryName("repo\u0000name")).toBeNull();
		expect(normalizeRepositoryName("repo\nname")).toBeNull();
		expect(normalizeRepositoryName("repo\u007fname")).toBeNull();
	});

	it("rejects a name below the canonical codebase name minimum", () => {
		expect(normalizeRepositoryName("js")).toBeNull();
		expect(normalizeRepositoryName("ab")).toBeNull();
	});

	it("rejects a name above the canonical codebase name maximum", () => {
		expect(normalizeRepositoryName("a".repeat(101))).toBeNull();
		expect(normalizeRepositoryName("a".repeat(100))).toBe("a".repeat(100));
	});

	it("rejects non-string input instead of coercing it", () => {
		expect(normalizeRepositoryName(undefined)).toBeNull();
		expect(normalizeRepositoryName(null)).toBeNull();
		expect(normalizeRepositoryName(42)).toBeNull();
		expect(normalizeRepositoryName({ repositoryName: "repo" })).toBeNull();
	});
});
