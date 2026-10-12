import { describe, expect, it } from "vitest";
import {
	compareRepositoryIdentity,
	normalizeRepositoryIdentity,
} from "./codebase-repository-identity";

describe("normalizeRepositoryIdentity", () => {
	it("normalizes an https remote", () => {
		expect(
			normalizeRepositoryIdentity(
				"https://github.com/ghazyAlghifari508/prdfy.git",
			),
		).toBe("github.com/ghazyalghifari508/prdfy");
	});

	it("produces the same identity from the ssh and https forms of one remote", () => {
		const https = normalizeRepositoryIdentity(
			"https://github.com/owner/react-movie-app.git",
		);
		const ssh = normalizeRepositoryIdentity(
			"git@github.com:owner/react-movie-app.git",
		);
		expect(ssh).toBe(https);
		expect(ssh).toBe("github.com/owner/react-movie-app");
	});

	it("ignores a trailing slash and the .git suffix", () => {
		const withNoise = normalizeRepositoryIdentity(
			"https://github.com/owner/app.git/",
		);
		const clean = normalizeRepositoryIdentity("https://github.com/owner/app");
		expect(withNoise).toBe(clean);
	});

	it("is case-insensitive", () => {
		expect(
			normalizeRepositoryIdentity("https://GitHub.com/Owner/App.GIT"),
		).toBe("github.com/owner/app");
	});

	it("strips embedded credentials so no secret survives", () => {
		const identity = normalizeRepositoryIdentity(
			"https://user:ghp_secrettoken@github.com/owner/app.git",
		);
		expect(identity).toBe("github.com/owner/app");
		expect(identity).not.toContain("ghp_secrettoken");
		expect(identity).not.toContain("user");
	});

	it("strips a port", () => {
		expect(
			normalizeRepositoryIdentity(
				"https://git.internal.example:8443/team/app.git",
			),
		).toBe("git.internal.example/team/app");
	});

	it("drops query and fragment", () => {
		expect(
			normalizeRepositoryIdentity("https://github.com/owner/app.git?ref=main"),
		).toBe("github.com/owner/app");
	});

	it("keeps the host so same-named paths on different hosts stay distinct", () => {
		const a = normalizeRepositoryIdentity("https://github.com/owner/app");
		const b = normalizeRepositoryIdentity("https://gitlab.com/owner/app");
		expect(a).not.toBe(b);
	});

	it("keeps nested group paths distinct", () => {
		const a = normalizeRepositoryIdentity("https://gitlab.com/group/app");
		const b = normalizeRepositoryIdentity("https://gitlab.com/group/sub/app");
		expect(a).not.toBe(b);
	});

	it("skips transport-noise segments", () => {
		expect(
			normalizeRepositoryIdentity("https://dev.azure.com/org/project/_git/app"),
		).toBe("dev.azure.com/org/project/app");
	});

	it("returns null for a repository with no remote", () => {
		expect(normalizeRepositoryIdentity(null)).toBeNull();
		expect(normalizeRepositoryIdentity(undefined)).toBeNull();
		expect(normalizeRepositoryIdentity("")).toBeNull();
		expect(normalizeRepositoryIdentity("   ")).toBeNull();
	});

	it("returns null for a local filesystem path", () => {
		expect(normalizeRepositoryIdentity("C:\\Coding\\app")).toBeNull();
		expect(normalizeRepositoryIdentity("/home/user/app")).toBeNull();
		expect(normalizeRepositoryIdentity("\\\\server\\share\\app")).toBeNull();
	});

	it("returns null for a value that is only a host", () => {
		expect(normalizeRepositoryIdentity("https://github.com")).toBeNull();
		expect(normalizeRepositoryIdentity("https://github.com/")).toBeNull();
	});

	it("returns null for something that is not a remote at all", () => {
		expect(normalizeRepositoryIdentity("not a remote")).toBeNull();
		expect(normalizeRepositoryIdentity("app")).toBeNull();
	});
});

describe("compareRepositoryIdentity", () => {
	it("matches identical identities", () => {
		expect(
			compareRepositoryIdentity("github.com/owner/app", "github.com/owner/app"),
		).toEqual({ matches: true, adoptable: false });
	});

	it("never matches when one side is unknown", () => {
		// An unknown identity must not be treated as agreement.
		expect(compareRepositoryIdentity(null, "github.com/owner/app")).toEqual({
			matches: false,
			adoptable: true,
		});
		expect(compareRepositoryIdentity("github.com/owner/app", null)).toEqual({
			matches: false,
			adoptable: false,
		});
		expect(compareRepositoryIdentity(null, null)).toEqual({
			matches: false,
			adoptable: false,
		});
	});

	it("reports a mismatch for two different repositories of the same name", () => {
		expect(
			compareRepositoryIdentity("github.com/owner/app", "gitlab.com/other/app"),
		).toEqual({ matches: false, adoptable: false });
	});

	it("treats a blank stored value as adoptable, not as a match", () => {
		expect(compareRepositoryIdentity("   ", "github.com/owner/app")).toEqual({
			matches: false,
			adoptable: true,
		});
	});
});
