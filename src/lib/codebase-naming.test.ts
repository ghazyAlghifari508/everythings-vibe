import { describe, expect, it } from "vitest";
import {
	isProvisionalCodebaseName,
	resolveCodebaseDisplayName,
} from "./codebase-library";
import { buildAgentPrompt, type SyncPromptPayload } from "./codebase-sync";

function syncPayload(): SyncPromptPayload {
	return {
		projectId: "cb-naming-1",
		apiBaseUrl: "http://localhost:3000",
		syncToken: "naming-token",
		cliMinVersion: "2.0.0",
		syncCommand:
			"vibeeverything codebase sync --project-id cb-naming-1 --sync-token <token>",
		expiresAt: new Date(Date.now() + 3600000).toISOString(),
	};
}

describe("isProvisionalCodebaseName", () => {
	it("treats the system placeholder as provisional", () => {
		expect(isProvisionalCodebaseName("Repository Lokal")).toBe(true);
	});

	it("tolerates surrounding whitespace around the placeholder", () => {
		expect(isProvisionalCodebaseName("  Repository Lokal  ")).toBe(true);
	});

	it("treats detected and user names as resolved", () => {
		expect(isProvisionalCodebaseName("react-movie-app")).toBe(false);
		expect(isProvisionalCodebaseName("Movie Explorer Frontend")).toBe(false);
	});

	it("treats non-string and empty values as not provisional", () => {
		expect(isProvisionalCodebaseName("")).toBe(false);
		expect(isProvisionalCodebaseName(null)).toBe(false);
		expect(isProvisionalCodebaseName(undefined)).toBe(false);
	});
});

describe("resolveCodebaseDisplayName", () => {
	it("returns null for the provisional placeholder", () => {
		expect(resolveCodebaseDisplayName("Repository Lokal")).toBeNull();
	});

	it("returns the trimmed name for resolved repositories", () => {
		expect(resolveCodebaseDisplayName("react-movie-app")).toBe(
			"react-movie-app",
		);
	});

	it("returns null for missing or blank names", () => {
		expect(resolveCodebaseDisplayName(null)).toBeNull();
		expect(resolveCodebaseDisplayName(undefined)).toBeNull();
		expect(resolveCodebaseDisplayName("   ")).toBeNull();
	});
});

describe("buildAgentPrompt repository identity", () => {
	it("omits any repository identity for the provisional placeholder", () => {
		const prompt = buildAgentPrompt(syncPayload(), {
			projectName: "Repository Lokal",
		});
		expect(prompt).not.toContain("Nama Fitur");
		expect(prompt).not.toContain("Repository Lokal");
		expect(prompt).toContain("## Informasi Sinkronisasi");
		expect(prompt).toContain("cb-naming-1");
	});

	it("omits any repository identity when no name is known", () => {
		const prompt = buildAgentPrompt(syncPayload());
		expect(prompt).not.toContain("Nama Fitur");
		expect(prompt).not.toContain("Nama Repository");
		expect(prompt).toContain("## Informasi Sinkronisasi");
	});

	it("renders the detected repository name once the CLI has reported it", () => {
		const prompt = buildAgentPrompt(syncPayload(), {
			projectName: "react-movie-app",
		});
		expect(prompt).toContain("react-movie-app");
		expect(prompt).not.toContain("Nama Fitur");
	});
});
