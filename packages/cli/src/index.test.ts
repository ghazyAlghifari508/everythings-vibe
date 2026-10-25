import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The wiring test must not depend on this machine having a saved credential.
// Only the credential reader is replaced; every other config behavior stays real.
vi.mock("./lib/config.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./lib/config.js")>();
	return { ...actual, getApiKey: () => "wiring-test-api-key" };
});

import { program } from "./index.js";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Route mocked sync requests the way the Task 4–5 server boundary will. */
function stubSyncServer() {
	return vi.fn(async (url: string, init?: RequestInit) => {
		if (url.endsWith("/codebase/sync")) {
			return jsonResponse(200, {
				sessionId: "sess-1",
				attemptId: "att-1",
				status: "connected",
			});
		}
		if (url.endsWith("/codebase/manifest")) {
			return jsonResponse(200, { status: "uploading" });
		}
		if (url.endsWith("/codebase/files")) {
			return jsonResponse(200, { status: "uploading" });
		}
		if (url.endsWith("/codebase/complete")) {
			const body = JSON.parse(String(init?.body)) as {
				fileCount: number;
				excludedCount: number;
			};
			return jsonResponse(200, {
				status: "uploaded",
				fileCount: body.fileCount,
				excludedCount: body.excludedCount,
			});
		}
		throw new Error(`unexpected request in test: ${url}`);
	});
}

/** Paths the export reported as written, read out of the JSON result. */
function exportedFiles(result: unknown): string[] {
	if (typeof result !== "object" || result === null) return [];
	if (!("written" in result)) return [];
	const written: unknown = result.written;
	if (!Array.isArray(written)) return [];
	return written.filter((path): path is string => typeof path === "string");
}

let repos: string[] = [];

afterEach(() => {
	for (const repo of repos) rmSync(repo, { recursive: true, force: true });
	repos = [];
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("prdfy codebase sync argv wiring", () => {
	it("maps dashed flags to camelCase action values (project-id, sync-token, api-url)", async () => {
		const root = mkdtempSync(join(tmpdir(), "prdfy-wiring-"));
		repos.push(root);
		writeFileSync(join(root, "app.ts"), "export const app = 1;\n");
		const fetchMock = stubSyncServer();
		vi.stubGlobal("fetch", fetchMock);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit should not be called on success");
		}) as never);

		await program.parseAsync([
			"node",
			"prdfy",
			"codebase",
			"sync",
			"--project-id",
			"proj-wiring",
			"--sync-token",
			"wiring-test-token",
			"--root",
			root,
			"--output",
			"json",
			"--api-url",
			"http://localhost:3000",
		]);

		// With the old opts["project-id"] mapping this was INVALID_OPTIONS
		// (transport never called, exit 1). Now the handshake must run.
		expect(fetchMock).toHaveBeenCalled();
		const handshakeCall = fetchMock.mock.calls.find(([url]) =>
			String(url).endsWith("/codebase/sync"),
		);
		expect(handshakeCall).toBeDefined();
		const [url, init] = handshakeCall as [string, RequestInit];
		expect(url).toContain("/api/v1/codebases/proj-wiring/codebase/sync");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer wiring-test-token",
		);
		expect(url).not.toContain("wiring-test-token");
		expect(exitSpy).not.toHaveBeenCalled();

		const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(JSON.parse(logged)).toMatchObject({
			ok: true,
			projectId: "proj-wiring",
			sessionId: "sess-1",
		});
	});

	it("exits nonzero when the sync fails (bad repository root)", async () => {
		vi.stubGlobal("fetch", stubSyncServer());
		vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
			code?: number,
		) => {
			throw new Error(`exit:${code ?? ""}`);
		}) as never);

		await expect(
			program.parseAsync([
				"node",
				"prdfy",
				"codebase",
				"sync",
				"--project-id",
				"proj-wiring",
				"--sync-token",
				"tok",
				"--root",
				join(tmpdir(), "prdfy-does-not-exist-xyz"),
				"--api-url",
				"http://localhost:3000",
			]),
		).rejects.toThrow("exit:1");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

describe("everythings-vibe export plan argv wiring", () => {
	it("maps export plan <id> --root/--api-url to the command action", async () => {
		const root = mkdtempSync(join(tmpdir(), "prdfy-plan-wiring-"));
		repos.push(root);
		const featureTree = {
			productName: "Wiring App",
			createdAt: "2026-09-30T00:00:00.000Z",
			features: [
				{
					id: "feat-1",
					name: "Watchlist",
					phase: 1,
					description: "Simpan film.",
					subfeatures: [
						{ id: "sub-1", name: "Tambah", description: "Tombol simpan." },
					],
				},
			],
		};
		const fetchMock = vi.fn(async (url: string) => {
			const path = new URL(url).pathname;
			if (path.endsWith("/prd")) {
				return jsonResponse(200, { content: "# PRD Wiring\n", version: 1 });
			}
			if (path.endsWith("/ac")) {
				return jsonResponse(200, { content: "# AC Wiring\n", version: 1 });
			}
			if (path.endsWith("/tasks")) {
				return jsonResponse(200, {
					tasks: [
						{
							id: "task-1",
							name: "Bangun watchlist",
							description: "Render daftar.",
							status: "pending",
							priority: "high",
							featureName: "Watchlist",
							dependencies: [],
							covers: ["AC-1.1"],
							surfaces: ["Watchlist Page"],
							startedAt: null,
							completedAt: null,
							subtasks: [],
						},
					],
				});
			}
			return jsonResponse(200, {
				id: "proj-plan-wiring",
				name: "Watchlist",
				step: "task",
				featureTree,
				codebase: null,
				snapshot: null,
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit should not be called on success");
		}) as never);

		await program.parseAsync([
			"node",
			"prdfy",
			"export",
			"plan",
			"proj-plan-wiring",
			"--root",
			root,
			"--output",
			"json",
			"--api-url",
			"http://localhost:3000",
		]);

		// A missing camelCase mapping would leave the command unregistered or
		// fail before any request; the export must reach the API and write files.
		expect(fetchMock).toHaveBeenCalled();
		const urls = fetchMock.mock.calls.map(([url]) => String(url));
		expect(urls).toContain(
			"http://localhost:3000/api/v1/projects/proj-plan-wiring",
		);
		expect(exitSpy).not.toHaveBeenCalled();

		const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
		const result: unknown = JSON.parse(logged);
		expect(result).toMatchObject({
			ok: true,
			projectId: "proj-plan-wiring",
		});
		expect(exportedFiles(result)).toContain("docs/vibeplan/manifest.json");

		// `--root` was honored: artifacts landed inside the temp directory.
		const manifestPath = join(root, "docs", "vibeplan", "manifest.json");
		expect(readFileSync(manifestPath, "utf-8")).toContain("proj-plan-wiring");
	});

	it("exits nonzero when export plan fails", async () => {
		const root = mkdtempSync(join(tmpdir(), "prdfy-plan-wiring-"));
		repos.push(root);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(404, { error: "PRD not found" })),
		);
		vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
			code?: number,
		) => {
			throw new Error(`exit:${code ?? ""}`);
		}) as never);

		await expect(
			program.parseAsync([
				"node",
				"prdfy",
				"export",
				"plan",
				"proj-plan-wiring",
				"--root",
				root,
				"--output",
				"json",
				"--api-url",
				"http://localhost:3000",
			]),
		).rejects.toThrow("exit:1");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

describe("CLI branding and commands", () => {
	it("has name everythings-vibe and proper description", () => {
		expect(program.name()).toBe("everythings-vibe");
		expect(program.description()).toContain("everythings-vibe");
	});

	it("registers codebase sync command", () => {
		const codebase = program.commands.find((c) => c.name() === "codebase");
		expect(codebase).toBeDefined();
		const sync = codebase?.commands.find((c) => c.name() === "sync");
		expect(sync).toBeDefined();
	});

	// `program.description()` is what `--help` prints, so it must name every
	// command group the CLI actually registers. packages/cli/package.json:4 is
	// the wording the approved plan dictated for exactly this string.
	it("describes the codebases command group it registers", () => {
		expect(program.description()).toContain("codebases");
	});

	it("keeps the --help description identical to the published package description", async () => {
		const pkg = JSON.parse(
			readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
		) as { description: string };
		expect(program.description()).toBe(pkg.description);
	});
});
