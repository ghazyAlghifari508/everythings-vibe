// @vitest-environment node
/**
 * Live round-trip for `export plan`.
 *
 * The stubbed suite proves the planner and the writer. This suite proves the
 * transport: the CLI talks to a real HTTP server over the real api client, and
 * the JSON shapes the server returns are the ones the export parses. A stub
 * cannot catch a header, URL, or serialization mistake, so the two are kept
 * separate on purpose.
 */

import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const API_KEY = "live-round-trip-key";

// The credential comes from the shared config module, exactly as it does in
// production. Mocking it here is what lets the live round trip assert the real
// Authorization header without writing to the developer's home directory.
vi.mock("../lib/config.js", async () => {
	const actual =
		await vi.importActual<typeof import("../lib/config.js")>(
			"../lib/config.js",
		);
	return {
		...actual,
		getApiKey: () => API_KEY,
		getApiUrl: () => "http://localhost:3000",
	};
});

const { exportPlan } = await import("./export-plan.js");

const FEATURE_TREE = {
	productName: "React Movie App",
	createdAt: "2026-10-01T00:00:00.000Z",
	features: [
		{
			id: "f1",
			name: "Watchlist",
			phase: 1,
			description: "Simpan film untuk ditonton nanti.",
			subfeatures: [
				{
					id: "f1s1",
					name: "Tambah ke watchlist",
					description: "Tombol simpan pada kartu film.",
				},
			],
		},
	],
};

const TASKS = [
	{
		id: "task-1",
		name: "Buat tombol simpan",
		description: "Tambahkan tombol pada kartu film.",
		status: "pending",
		priority: "high",
		featureName: "Watchlist",
		covers: ["AC-1.1"],
		surfaces: ["Detail Film"],
		dependencies: [],
		subtasks: [
			{
				name: "Komponen tombol",
				description: "Buat komponen tombol simpan.",
				status: "pending",
				details: [],
			},
		],
		startedAt: null,
		completedAt: null,
	},
];

interface LiveServer {
	url: string;
	requests: Array<{ url: string; authorization: string | null }>;
	close: () => Promise<void>;
}

async function startLiveServer(options: {
	prdStatus?: number;
	featureTree?: unknown;
}): Promise<LiveServer> {
	const requests: LiveServer["requests"] = [];
	const server = createServer((req, res) => {
		const url = req.url ?? "";
		requests.push({
			url,
			authorization: req.headers.authorization ?? null,
		});
		res.setHeader("Content-Type", "application/json");

		if (url === `/api/v1/projects/${PROJECT_ID}`) {
			res.end(
				JSON.stringify({
					id: PROJECT_ID,
					name: "Watchlist",
					step: "task",
					projectMode: "existing_codebase",
					featureTree:
						options.featureTree === undefined
							? FEATURE_TREE
							: options.featureTree,
					codebase: {
						id: "cb-live",
						name: "react-movie-app",
						repositoryIdentity: "github.com/acme/react-movie-app",
					},
					snapshot: {
						id: "snap-live",
						commitSha: "deadbeef",
						branch: "main",
						createdAt: "2026-10-02T00:00:00.000Z",
					},
				}),
			);
			return;
		}
		if (url === `/api/v1/projects/${PROJECT_ID}/prd`) {
			if (options.prdStatus && options.prdStatus !== 200) {
				res.statusCode = options.prdStatus;
				res.end(JSON.stringify({ error: "PRD not found" }));
				return;
			}
			res.end(
				JSON.stringify({
					projectId: PROJECT_ID,
					version: 3,
					content: "## Ringkasan\n\nFitur watchlist.\n",
				}),
			);
			return;
		}
		if (url === `/api/v1/projects/${PROJECT_ID}/ac`) {
			res.end(
				JSON.stringify({
					projectId: PROJECT_ID,
					version: 2,
					content: "### AC-1.1\n\n**Given** pengguna membuka detail film\n",
				}),
			);
			return;
		}
		if (url === `/api/v1/projects/${PROJECT_ID}/tasks`) {
			res.end(JSON.stringify({ tasks: TASKS }));
			return;
		}
		res.statusCode = 404;
		res.end(JSON.stringify({ error: "not found" }));
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
			}),
	};
}

const tempDirs: string[] = [];

function makeRepoRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "vibeplan-live-"));
	mkdirSync(join(root, ".git"), { recursive: true });
	writeFileSync(
		join(root, "AGENTS.md"),
		"# Repository rules\n\nDo not overwrite this file.\n",
	);
	tempDirs.push(root);
	return root;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs.length = 0;
});

describe("export plan over a live HTTP round trip", () => {
	it("authenticates with the configured key and writes every artifact", async () => {
		const server = await startLiveServer({});
		const root = makeRepoRoot();
		try {
			const result = await exportPlan(PROJECT_ID, {
				root,
				apiUrl: server.url,
				output: "json",
			});

			expect(result.ok).toBe(true);
			// The credential is sent as a Bearer header on every request, and
			// never appears in a URL.
			expect(server.requests.length).toBeGreaterThanOrEqual(4);
			for (const request of server.requests) {
				expect(request.authorization).toBe(`Bearer ${API_KEY}`);
				expect(request.url).not.toContain(API_KEY);
			}

			const featureDir = join(
				root,
				...(result.featureDirectory ?? "").split("/"),
			);
			const feature = readFileSync(join(featureDir, "feature.md"), "utf-8");
			expect(feature).toContain("Watchlist");
			expect(feature).toContain("Tambah ke watchlist");

			const handoff = readFileSync(join(featureDir, "HANDOFF.md"), "utf-8");
			expect(handoff).toContain(PROJECT_ID);
			// No credential may reach a document that can be committed.
			expect(handoff).not.toContain(API_KEY);
			const manifest = readFileSync(
				join(root, "docs", "vibeplan", "manifest.json"),
				"utf-8",
			);
			expect(manifest).not.toContain(API_KEY);
			expect(manifest).toContain("deadbeef");

			expect(readFileSync(join(root, "AGENTS.md"), "utf-8")).toContain(
				"Do not overwrite this file.",
			);
		} finally {
			await server.close();
		}
	});

	it("refuses to export when the server has no PRD, leaving no partial output", async () => {
		const server = await startLiveServer({ prdStatus: 404 });
		const root = makeRepoRoot();
		try {
			const result = await exportPlan(PROJECT_ID, {
				root,
				apiUrl: server.url,
				output: "json",
			});

			expect(result.ok).toBe(false);
			expect(result.written).toEqual([]);
			expect(result.errorMessage).toBeTruthy();
		} finally {
			await server.close();
		}
	});

	it("refuses to export when the feature tree is missing", async () => {
		const server = await startLiveServer({ featureTree: null });
		const root = makeRepoRoot();
		try {
			const result = await exportPlan(PROJECT_ID, {
				root,
				apiUrl: server.url,
				output: "json",
			});

			expect(result.ok).toBe(false);
			expect(result.written).toEqual([]);
		} finally {
			await server.close();
		}
	});

	it("is byte-for-byte idempotent across two live exports", async () => {
		const server = await startLiveServer({});
		const root = makeRepoRoot();
		try {
			const first = await exportPlan(PROJECT_ID, {
				root,
				apiUrl: server.url,
				output: "json",
			});
			expect(first.ok).toBe(true);
			expect(first.written.length).toBeGreaterThan(0);

			const second = await exportPlan(PROJECT_ID, {
				root,
				apiUrl: server.url,
				output: "json",
			});
			expect(second.ok).toBe(true);
			expect(second.written).toEqual([]);
			expect(second.conflicted).toEqual([]);
			expect(second.unchanged.length).toBe(first.written.length);
		} finally {
			await server.close();
		}
	});
});
