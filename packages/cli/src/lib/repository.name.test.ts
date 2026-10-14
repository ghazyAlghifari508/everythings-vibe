import { describe, expect, it } from "vitest";
import {
	getRepositoryName,
	resolveRepositoryDisplayName,
} from "./repository.js";

describe("getRepositoryName", () => {
	it("derives the folder name from a Windows repository root", () => {
		expect(
			getRepositoryName("C:\\Coding\\Web Development\\React\\react-movie-app"),
		).toBe("react-movie-app");
	});

	it("derives the folder name from a POSIX repository root", () => {
		expect(getRepositoryName("/home/user/projects/my-saas")).toBe("my-saas");
	});

	it("derives the folder name from a bare relative path", () => {
		expect(getRepositoryName("clipperbintang")).toBe("clipperbintang");
	});

	it("ignores a trailing separator instead of returning nothing", () => {
		expect(getRepositoryName("/home/user/projects/my-saas/")).toBe("my-saas");
		expect(
			getRepositoryName(
				"C:\\Coding\\Web Development\\React\\react-movie-app\\",
			),
		).toBe("react-movie-app");
	});

	it("returns null when the root carries no folder name", () => {
		expect(getRepositoryName("/")).toBeNull();
		expect(getRepositoryName("C:\\")).toBeNull();
		expect(getRepositoryName("")).toBeNull();
		expect(getRepositoryName("   ")).toBeNull();
	});

	it("returns null for a candidate that is a relative traversal segment", () => {
		expect(getRepositoryName(".")).toBeNull();
		expect(getRepositoryName("..")).toBeNull();
		expect(getRepositoryName("C:.")).toBeNull();
	});

	it("returns null for a name carrying control characters", () => {
		expect(getRepositoryName("/home/user/repo\u0000name")).toBeNull();
		expect(getRepositoryName("/home/user/repo\nname")).toBeNull();
	});

	it("never returns a path separator or a drive prefix inside the name", () => {
		const name = getRepositoryName("/home/user/projects/my-saas");
		expect(name).not.toContain("/");
		expect(name).not.toContain("\\");
		expect(getRepositoryName("C:project")).toBeNull();
	});
});

describe("resolveRepositoryDisplayName", () => {
	it("uses the verified Git identity's repository segment before the local folder", () => {
		expect(
			resolveRepositoryDisplayName(
				"C:\\work\\local-copy",
				"github.com/owner/ocean-guard",
			),
		).toBe("Ocean Guard");
	});

	it("humanizes the root folder when Git identity is unavailable", () => {
		expect(
			resolveRepositoryDisplayName("C:\\work\\react-movie_app", null),
		).toBe("React Movie App");
	});

	it("does not infer a name from an unusable identity or root", () => {
		expect(resolveRepositoryDisplayName("C:\\", null)).toBeNull();
		expect(resolveRepositoryDisplayName("C:\\work\\repo", "")).toBe("Repo");
	});
});
