import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
	realScanRepository: null as
		| typeof import("../lib/repository.js").scanRepository
		| null,
}));

vi.mock("../lib/repository.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/repository.js")>();
	repositoryMocks.realScanRepository = actual.scanRepository;
	return {
		...actual,
		scanRepository: vi.fn(actual.scanRepository),
	};
});

vi.mock("../lib/sync-client.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/sync-client.js")>();
	return {
		...actual,
		createSyncClient: vi.fn(),
	};
});

vi.mock("../lib/config.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/config.js")>();
	return {
		...actual,
		saveConfig: vi.fn(),
		getApiUrl: vi.fn(() => "http://localhost:3000"),
	};
});

import { saveConfig } from "../lib/config.js";
import { scanRepository } from "../lib/repository.js";
import { createSyncClient } from "../lib/sync-client.js";
import { syncCodebase } from "./codebase.js";

function makeRepo(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "prdfy-codebase-"));
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, ...rel.split("/"));
		mkdirSync(join(abs, ".."), { recursive: true });
		writeFileSync(abs, content);
	}
	return root;
}

let repos: string[] = [];

function trackRepo(root: string): string {
	repos.push(root);
	return root;
}

afterEach(() => {
	for (const repo of repos) rmSync(repo, { recursive: true, force: true });
	repos = [];
	vi.restoreAllMocks();
	vi.mocked(createSyncClient).mockReset();
	vi.mocked(scanRepository).mockReset();
});

function restoreScanRepository(): void {
	const real = repositoryMocks.realScanRepository;
	if (real) vi.mocked(scanRepository).mockImplementation(real);
}

const SESSION = { sessionId: "sess-1", attemptId: "att-1" };

interface CompletionCounts {
	fileCount: number;
	excludedCount: number;
}

interface ChunkArg {
	path: string;
}

function mockClient(overrides: Record<string, unknown> = {}) {
	const client = {
		handshake: vi.fn(async () => ({
			...SESSION,
			status: "connected",
		})),
		handshakeWithRetry: vi.fn(async () => ({
			...SESSION,
			status: "connected",
		})),
		uploadManifestWithRetry: vi.fn(
			async (
				_projectId: string,
				_session: typeof SESSION,
				_entries: unknown,
			) => ({ status: "uploading" }),
		),
		uploadFileChunksWithRetry: vi.fn(
			async (
				_projectId: string,
				_session: typeof SESSION,
				_chunks: ChunkArg[],
				_startIndex?: number,
			) => ({ status: "uploading" }),
		),
		completeWithRetry: vi.fn(
			async (_proj: string, input: CompletionCounts) => ({
				status: "uploaded",
				fileCount: input.fileCount,
				excludedCount: input.excludedCount,
			}),
		),
		reportFailureWithRetry: vi.fn(async () => ({
			status: "failed",
			errorCode: "SYNC_FAILED",
			errorMessage: "Sinkronisasi gagal.",
		})),
		...overrides,
	};
	vi.mocked(createSyncClient).mockReturnValue(client as never);
	return client;
}

describe("syncCodebase validation", () => {
	beforeEach(() => {
		restoreScanRepository();
		mockClient();
	});

	it("rejects empty project id or sync token before any IO", async () => {
		const root = trackRepo(makeRepo({ "a.ts": "const a = 1;\n" }));
		const res = await syncCodebase({
			projectId: "",
			syncToken: "tok",
			root,
			output: "json",
		});
		expect(res.ok).toBe(false);
		expect(res.errorCode).toBe("INVALID_OPTIONS");
		expect(vi.mocked(createSyncClient)).not.toHaveBeenCalled();
	});

	it("rejects an invalid output mode", async () => {
		const root = trackRepo(makeRepo({ "a.ts": "const a = 1;\n" }));
		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "yaml" as never,
		});
		expect(res.ok).toBe(false);
		expect(res.errorCode).toBe("INVALID_OPTIONS");
	});
});

describe("syncCodebase blocked content", () => {
	it("refuses to upload when the manifest contains secret-matched content", async () => {
		const client = mockClient();
		const root = trackRepo(
			makeRepo({
				"src/app.ts": "export const app = 1;\n",
				// Placeholder-shaped match, not a real credential.
				"src/leak.ts": "const api_key = '<placeholder-value>';\n",
			}),
		);

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(false);
		expect(res.errorCode).toBe("BLOCKED_CONTENT");
		// The blocked path is safe metadata for the local terminal report, and the
		// matched value never surfaces.
		expect(res.errorMessage).toContain("src/leak.ts");
		expect(res.errorMessage).not.toContain("<placeholder-value>");
		expect(client.uploadManifestWithRetry).not.toHaveBeenCalled();
		expect(client.uploadFileChunksWithRetry).not.toHaveBeenCalled();
		expect(client.completeWithRetry).not.toHaveBeenCalled();
	});
});

describe("handshake precedes local preparation", () => {
	it("performs the handshake before any repository walk so the server can observe preparation", async () => {
		const client = mockClient();
		const order: string[] = [];
		client.handshakeWithRetry.mockImplementation(async () => {
			order.push("handshake");
			return { ...SESSION, status: "connected" };
		});
		client.uploadManifestWithRetry.mockImplementation(async () => {
			order.push("manifest");
			return { status: "uploading" };
		});
		client.completeWithRetry.mockImplementation(async () => {
			order.push("complete");
			return { status: "uploaded", fileCount: 2, excludedCount: 1 };
		});
		const root = trackRepo(
			makeRepo({
				"src/app.ts": "export const app = 1;\n",
				"README.md": "# demo\n",
			}),
		);

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		// The first server contact is the handshake, so `connected` is persisted
		// while the CLI is still preparing source locally.
		expect(order[0]).toBe("handshake");
		expect(order).toEqual(["handshake", "manifest", "complete"]);
	});

	it("reports a preparation failure instead of leaving the session connected", async () => {
		const client = mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		expect(client.reportFailureWithRetry).not.toHaveBeenCalled();
	});

	it("reports the blocked-content failure to the server so the browser converges", async () => {
		const client = mockClient();
		const root = trackRepo(
			makeRepo({
				"src/app.ts": "export const app = 1;\n",
				// Placeholder-shaped match, not a real credential.
				"src/leak.ts": "const api_key = '<placeholder-value>';\n",
			}),
		);

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(false);
		// The refusal now happens after the handshake, so the session would sit
		// at `connected` without this report.
		expect(client.handshakeWithRetry).toHaveBeenCalledOnce();
		expect(client.reportFailureWithRetry).toHaveBeenCalledWith("p1", {
			sessionId: "sess-1",
			attemptId: "att-1",
			errorCode: "BLOCKED_CONTENT",
		});
	});

	it("never sends the blocked path or the repository root in the failure report", async () => {
		const client = mockClient();
		const root = trackRepo(
			makeRepo({
				"src/leak.ts": "const api_key = '<placeholder-value>';\n",
			}),
		);

		await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		const serialized = JSON.stringify(client.reportFailureWithRetry.mock.calls);
		expect(serialized).not.toContain("src/leak.ts");
		expect(serialized).not.toContain("<placeholder-value>");
		expect(serialized).not.toContain(root);
	});

	it("keeps the local failure as the result when the failure report itself fails", async () => {
		mockClient({
			reportFailureWithRetry: vi.fn(async () => {
				throw new Error("network down");
			}),
		});
		const root = trackRepo(
			makeRepo({ "src/leak.ts": "const api_key = '<placeholder-value>';\n" }),
		);

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(false);
		expect(res.errorCode).toBe("BLOCKED_CONTENT");
		expect(res.errorMessage).toContain("src/leak.ts");
	});

	it("reports a scan failure under its own code", async () => {
		const client = mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));
		vi.mocked(scanRepository).mockRejectedValueOnce(
			new Error("Cannot scan repository root"),
		);

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(false);
		expect(res.errorCode).toBe("SCAN_FAILED");
		expect(client.handshakeWithRetry).toHaveBeenCalledOnce();
		expect(client.reportFailureWithRetry).toHaveBeenCalledWith("p1", {
			sessionId: "sess-1",
			attemptId: "att-1",
			errorCode: "SCAN_FAILED",
		});
	});

	it("succeeds without reporting a failure once preparation is restored", async () => {
		const client = mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));
		restoreScanRepository();

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		expect(res.status).toBe("uploaded");
		expect(client.reportFailureWithRetry).not.toHaveBeenCalled();
	});
});

describe("syncCodebase happy path", () => {
	it("syncs eligible text files and returns the JSON result shape", async () => {
		const client = mockClient();
		const root = trackRepo(
			makeRepo({
				"src/app.ts": "export const app = 1;\n",
				"README.md": "# demo\n",
			}),
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		expect(res.projectId).toBe("p1");
		expect(res.sessionId).toBe("sess-1");
		expect(res.status).toBe("uploaded");
		// fileCount = eligible entries, excludedCount = all exclusions (Task 2).
		// The run bootstraps `.prdfyignore`, and the scanner excludes its own
		// control file, so one exclusion is expected here.
		expect(res.fileCount).toBe(2);
		expect(res.excludedCount).toBe(1);
		expect(res.uploadedFiles).toBe(2);
		expect(res.ignoreCreated).toBe(true);
		// The ignore file is local sync configuration, never uploaded content.
		const uploadedPaths = client.uploadFileChunksWithRetry.mock.calls.flatMap(
			(call) =>
				(call[2] as Array<{ path: string }> | undefined)?.map((c) => c.path) ??
				[],
		);
		expect(uploadedPaths).not.toContain(".prdfyignore");
		expect(uploadedPaths).toEqual(["README.md", "src/app.ts"]);

		const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		const parsed = JSON.parse(logged);
		expect(parsed.ok).toBe(true);
		expect(parsed.sessionId).toBe("sess-1");
		expect(parsed.fileCount).toBe(2);
		logSpy.mockRestore();

		expect(client.uploadManifestWithRetry).toHaveBeenCalledOnce();
		expect(client.uploadFileChunksWithRetry).toHaveBeenCalledTimes(2);
		expect(client.uploadFileChunksWithRetry.mock.calls[0]?.[3]).toBe(0);
		expect(client.uploadFileChunksWithRetry.mock.calls[1]?.[3]).toBe(1);
		expect(client.completeWithRetry).toHaveBeenCalledOnce();
	});

	it("never uploads binary files", async () => {
		const client = mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));
		writeFileSync(
			join(root, "logo.png"),
			Buffer.from([0x89, 0x50, 0x00, 0xff]),
		);
		vi.spyOn(console, "log")
			.mockImplementation(() => {})
			.mockRestore();

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		expect(res.fileCount).toBe(1);
		const manifestArg = client.uploadManifestWithRetry.mock.calls[0]?.[2] as
			| Array<{ path: string }>
			| undefined;
		expect(manifestArg?.map((entry) => entry.path)).toEqual(["src/app.ts"]);
		const chunksArg = client.uploadFileChunksWithRetry.mock.calls[0]?.[2];
		expect(chunksArg?.map((c) => c.path)).not.toContain("logo.png");
		expect(res.excludedCount).toBeGreaterThanOrEqual(1);
	});

	it("prints a human summary with real statuses and no invented percentages", async () => {
		mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "human",
		});

		expect(res.ok).toBe(true);
		const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(logged).toContain("uploaded");
		expect(logged).not.toContain("%");
		logSpy.mockRestore();
	});

	it("reports incomplete sync as failure", async () => {
		mockClient({
			completeWithRetry: vi.fn(async () => ({
				status: "failed",
				errorCode: "SNAPSHOT_REJECTED",
				errorMessage: "Snapshot rejected",
			})),
		});
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(false);
		expect(res.status).toBe("failed");
	});

	it("never persists the sync token to global config", async () => {
		mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));

		await syncCodebase({
			projectId: "p1",
			syncToken: "super-secret-token",
			root,
			output: "json",
		});

		expect(vi.mocked(saveConfig)).not.toHaveBeenCalled();
		// The token travels in memory to the sync client (required for Bearer
		// auth) but must never reach the global config writer.
		const clientOptions = vi.mocked(createSyncClient).mock.calls[0]?.[0] as
			| { syncToken?: string }
			| undefined;
		expect(clientOptions?.syncToken).toBe("super-secret-token");
	});
});

describe("syncCodebase repository naming", () => {
	it("handshakes with the repository folder name, never the absolute root", async () => {
		const client = mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		expect(client.handshakeWithRetry).toHaveBeenCalledWith(
			"p1",
			basename(root),
		);
	});

	it("reports the repository name in machine-readable output without the root", async () => {
		mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.repositoryName).toBe(basename(root));
		const printed = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(printed).toContain(basename(root));
		expect(printed).not.toContain(root);
		expect(printed).not.toContain("root");
		logSpy.mockRestore();
	});

	it("still completes the sync when no repository name can be derived", async () => {
		const client = mockClient();
		const root = trackRepo(makeRepo({ "src/app.ts": "export const x = 1;\n" }));

		const res = await syncCodebase({
			projectId: "p1",
			syncToken: "tok",
			root,
			output: "json",
		});

		expect(res.ok).toBe(true);
		expect(client.handshakeWithRetry).toHaveBeenCalledWith(
			"p1",
			basename(root),
		);
	});
});
