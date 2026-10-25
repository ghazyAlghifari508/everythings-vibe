import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ExportPlanResult,
	exportPlan,
	exportPlanCommand,
} from "./export-plan.js";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";
const FEATURE_DIR = "docs/vibeplan/watchlist-11111111";

const PRD_CONTENT = `# PRD Watchlist

## Requirements
- User bisa menambahkan film ke watchlist
`;

const AC_CONTENT = `# Acceptance Criteria

## Watchlist
- AC-1.1 User bisa menambahkan film ke watchlist
`;

const FEATURE_TREE = {
	productName: "React Movie App",
	createdAt: "2026-09-30T00:00:00.000Z",
	features: [
		{
			id: "feat-1",
			name: "Watchlist",
			phase: 1,
			description: "Simpan film yang ingin ditonton.",
			subfeatures: [
				{
					id: "sub-1",
					name: "Tambah ke watchlist",
					description: "Tombol simpan pada halaman detail.",
				},
			],
		},
	],
};

const TASKS = [
	{
		id: "task-11111111",
		name: "Bangun halaman watchlist",
		description: "Render daftar film tersimpan.",
		status: "pending",
		priority: "high",
		featureName: "Watchlist",
		dependencies: [],
		covers: ["AC-1.1"],
		surfaces: ["Watchlist Page"],
		startedAt: null,
		completedAt: null,
		subtasks: [
			{
				name: "Buat komponen list",
				description: "List film dengan empty state.",
				status: "pending",
				details: ["Gunakan data server"],
			},
		],
	},
];

interface ServerOverrides {
	project?: unknown;
	prd?: { status: number; body: unknown };
	ac?: { status: number; body: unknown };
	tasks?: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Read a header map out of a captured fetch init without a type assertion. */
function readHeaders(init: RequestInit | undefined): Record<string, string> {
	const headers = init?.headers;
	if (!headers) return {};
	if (headers instanceof Headers) return Object.fromEntries(headers.entries());
	if (Array.isArray(headers)) return Object.fromEntries(headers);
	return { ...headers };
}

function projectDetail() {
	return {
		id: PROJECT_ID,
		name: "Watchlist",
		step: "task",
		featureTree: FEATURE_TREE,
		codebase: {
			id: "cb-1",
			name: "react-movie-app",
			repositoryIdentity: "github.com/acme/react-movie-app",
		},
		snapshot: {
			id: "snap-1",
			commitSha: "abc123",
			branch: "main",
			createdAt: "2026-10-01T00:00:00.000Z",
		},
	};
}

function stubServer(overrides: ServerOverrides = {}) {
	const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
		const path = new URL(url).pathname;
		if (path.endsWith("/prd")) {
			const override = overrides.prd;
			return override
				? jsonResponse(override.status, override.body)
				: jsonResponse(200, { content: PRD_CONTENT, version: 3 });
		}
		if (path.endsWith("/ac")) {
			const override = overrides.ac;
			return override
				? jsonResponse(override.status, override.body)
				: jsonResponse(200, { content: AC_CONTENT, version: 2 });
		}
		if (path.endsWith("/tasks")) {
			return jsonResponse(200, overrides.tasks ?? { tasks: TASKS });
		}
		if (path.endsWith(`/projects/${PROJECT_ID}`)) {
			return jsonResponse(200, overrides.project ?? projectDetail());
		}
		throw new Error(`unexpected request in test: ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const tempRoots: string[] = [];

function makeRepoRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "prdfy-export-plan-"));
	tempRoots.push(root);
	// A repository marker so `resolveRepositoryRoot` accepts the temp root.
	mkdirSync(join(root, ".git"), { recursive: true });
	return root;
}

function readRepoFile(root: string, relativePath: string): string {
	return readFileSync(join(root, ...relativePath.split("/")), "utf-8");
}

function writeRepoFile(
	root: string,
	relativePath: string,
	content: string,
): void {
	const full = join(root, ...relativePath.split("/"));
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content, "utf-8");
}

function artifactPaths(): string[] {
	return [
		`${FEATURE_DIR}/feature.md`,
		`${FEATURE_DIR}/PRD.md`,
		`${FEATURE_DIR}/AC.md`,
		`${FEATURE_DIR}/tasks.json`,
		`${FEATURE_DIR}/HANDOFF.md`,
		"docs/vibeplan/manifest.json",
	];
}

afterEach(() => {
	for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
	tempRoots.length = 0;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function silenceOutput(): void {
	vi.spyOn(console, "log").mockImplementation(() => {});
}

describe("exportPlan happy path", () => {
	it("writes all six files under docs/vibeplan", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();

		const result = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now: () => new Date("2026-10-10T00:00:00.000Z") },
		);

		expect(result.ok).toBe(true);
		expect(result.projectId).toBe(PROJECT_ID);
		expect(result.featureDirectory).toBe(FEATURE_DIR);
		expect(result.snapshotId).toBe("snap-1");
		expect([...result.written].sort()).toEqual([...artifactPaths()].sort());
		expect(result.unchanged).toEqual([]);
		expect(result.conflicted).toEqual([]);

		for (const relativePath of artifactPaths()) {
			expect(existsSync(join(root, ...relativePath.split("/")))).toBe(true);
		}
		expect(readRepoFile(root, `${FEATURE_DIR}/PRD.md`)).toContain(PRD_CONTENT);
		expect(readRepoFile(root, `${FEATURE_DIR}/AC.md`)).toContain(AC_CONTENT);
	});

	it("sends the Bearer credential to the v1 project endpoints", async () => {
		const root = makeRepoRoot();
		const fetchMock = stubServer();
		silenceOutput();

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		const urls = fetchMock.mock.calls.map(([url]) => String(url));
		expect(urls).toContain(
			`http://localhost:3000/api/v1/projects/${PROJECT_ID}`,
		);
		expect(urls).toContain(
			`http://localhost:3000/api/v1/projects/${PROJECT_ID}/prd`,
		);
		expect(urls).toContain(
			`http://localhost:3000/api/v1/projects/${PROJECT_ID}/ac`,
		);
		expect(urls).toContain(
			`http://localhost:3000/api/v1/projects/${PROJECT_ID}/tasks`,
		);
		for (const [, init] of fetchMock.mock.calls) {
			const headers = readHeaders(init);
			expect(headers?.Authorization).toMatch(/^Bearer \S+$/);
		}
	});

	it("does not commit or push: no git metadata is created", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		// Only the marker directory exists; the export never invokes git.
		expect(readdirSync(join(root, ".git"))).toEqual([]);
	});
});

describe("exportPlan idempotency and conflict handling", () => {
	it("reports everything unchanged and rewrites nothing when content is identical", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();
		const now = () => new Date("2026-10-10T00:00:00.000Z");

		const first = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now },
		);
		expect(first.written).toHaveLength(6);

		const before = artifactPaths().map((path) => readRepoFile(root, path));

		const second = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now },
		);

		expect(second.ok).toBe(true);
		expect(second.written).toEqual([]);
		expect(second.unchanged).toHaveLength(6);
		expect(second.conflicted).toEqual([]);

		const after = artifactPaths().map((path) => readRepoFile(root, path));
		expect(after).toEqual(before);
	});

	it("updates the file when the server artifact changed", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();
		const now = () => new Date("2026-10-10T00:00:00.000Z");

		await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now },
		);

		vi.unstubAllGlobals();
		stubServer({
			prd: {
				status: 200,
				body: { content: `${PRD_CONTENT}\n- Baris baru\n`, version: 4 },
			},
		});

		const second = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now },
		);

		expect(second.ok).toBe(true);
		expect(second.written).toContain(`${FEATURE_DIR}/PRD.md`);
		expect(second.unchanged.length).toBeGreaterThan(0);
		const prd = readRepoFile(root, `${FEATURE_DIR}/PRD.md`);
		expect(prd).toContain("Baris baru");
		expect(prd).toContain("versi 4");
	});

	it("preserves a hand-edited file and writes the new content as .vibeplan-new", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();
		const now = () => new Date("2026-10-10T00:00:00.000Z");

		await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now },
		);

		const handEdited = "# Catatan manual saya\n";
		writeRepoFile(root, `${FEATURE_DIR}/AC.md`, handEdited);

		vi.unstubAllGlobals();
		stubServer({
			ac: {
				status: 200,
				body: { content: `${AC_CONTENT}\n- AC-1.2 baru\n`, version: 5 },
			},
		});

		const second = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{ now },
		);

		expect(second.ok).toBe(true);
		expect(second.conflicted).toContain(`${FEATURE_DIR}/AC.md.vibeplan-new`);
		expect(second.written).not.toContain(`${FEATURE_DIR}/AC.md`);

		// The hand-edited file is untouched...
		expect(readRepoFile(root, `${FEATURE_DIR}/AC.md`)).toBe(handEdited);
		// ...and the new content landed beside it.
		const newContent = readRepoFile(root, `${FEATURE_DIR}/AC.md.vibeplan-new`);
		expect(newContent).toContain("AC-1.2 baru");
		expect(newContent).toContain("versi 5");
	});
});

describe("exportPlan failure paths", () => {
	it("fails with a clear error and writes nothing when the PRD is missing", async () => {
		const root = makeRepoRoot();
		stubServer({
			prd: { status: 404, body: { error: "PRD not found" } },
		});
		silenceOutput();

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("PRD_MISSING");
		expect(result.errorMessage).toContain("PRD");
		expect(result.written).toEqual([]);
		expect(existsSync(join(root, "docs"))).toBe(false);
		expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
	});

	it("fails and writes nothing when the AC is missing", async () => {
		const root = makeRepoRoot();
		stubServer({ ac: { status: 404, body: { error: "AC not found" } } });
		silenceOutput();

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("AC_MISSING");
		expect(existsSync(join(root, "docs"))).toBe(false);
	});

	it("fails when there are no tasks instead of writing an empty tasks.json", async () => {
		const root = makeRepoRoot();
		stubServer({ tasks: { tasks: [] } });
		silenceOutput();

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("TASKS_MISSING");
		expect(existsSync(join(root, "docs"))).toBe(false);
	});

	it("fails when the feature tree is missing", async () => {
		const root = makeRepoRoot();
		stubServer({ project: { ...projectDetail(), featureTree: null } });
		silenceOutput();

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("FEATURE_TREE_MISSING");
		expect(existsSync(join(root, "docs"))).toBe(false);
	});

	it("rejects an unsafe output path before writing anything", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();

		const result = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{
				planWrites: () => [
					{ relativePath: "../AGENTS.md", content: "escaped\n" },
				],
			},
		);

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("UNSAFE_OUTPUT_PATH");
		expect(result.written).toEqual([]);
		expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
	});

	it("never reports success or unverified writes when a write cannot happen", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();
		// A directory occupying the PRD path makes that write impossible.
		mkdirSync(join(root, ...`${FEATURE_DIR}/PRD.md`.split("/")), {
			recursive: true,
		});

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("EXPORT_FAILED");
		// Nothing is claimed as written, and no artifact was partially created.
		expect(result.written).toEqual([]);
		expect(result.conflicted).toEqual([]);
		expect(
			existsSync(join(root, ...`${FEATURE_DIR}/feature.md`.split("/"))),
		).toBe(false);
		expect(
			existsSync(join(root, ...`${FEATURE_DIR}/manifest.json`.split("/"))),
		).toBe(false);
	});

	it("rejects a planned path outside docs/vibeplan even when it stays in the repo", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();

		const result = await exportPlan(
			PROJECT_ID,
			{ root, apiUrl: "http://localhost:3000", output: "json" },
			{
				planWrites: () => [
					{ relativePath: "src/injected.md", content: "escaped\n" },
				],
			},
		);

		expect(result.ok).toBe(false);
		expect(result.errorCode).toBe("UNSAFE_OUTPUT_PATH");
		expect(existsSync(join(root, "src"))).toBe(false);
	});
});

describe("exportPlan filesystem boundaries", () => {
	it("never touches AGENTS.md in the repository root", async () => {
		const root = makeRepoRoot();
		const agentsContent = "# Repository rules\nJangan diubah.\n";
		writeRepoFile(root, "AGENTS.md", agentsContent);
		stubServer();
		silenceOutput();

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(true);
		expect(readRepoFile(root, "AGENTS.md")).toBe(agentsContent);
		expect(result.written.some((path) => path.includes("AGENTS.md"))).toBe(
			false,
		);
	});

	it("keeps an unrelated file next to docs/vibeplan untouched", async () => {
		const root = makeRepoRoot();
		writeRepoFile(root, "docs/README.md", "existing docs\n");
		stubServer();
		silenceOutput();

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(readRepoFile(root, "docs/README.md")).toBe("existing docs\n");
	});

	it("does not remove another feature's directory on a second export", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		const otherFeatureFile = "docs/vibeplan/review-film-cccccccc/PRD.md";
		writeRepoFile(root, otherFeatureFile, "# PRD fitur lain\n");

		const secondProjectId = "bbbbbbbb-2222-3333-4444-555555555555";
		const fetchMock = vi.fn(async (url: string) => {
			const path = new URL(url).pathname;
			if (path.endsWith("/prd")) {
				return jsonResponse(200, { content: "# PRD Review\n", version: 1 });
			}
			if (path.endsWith("/ac")) {
				return jsonResponse(200, { content: "# AC Review\n", version: 1 });
			}
			if (path.endsWith("/tasks")) {
				return jsonResponse(200, { tasks: TASKS });
			}
			return jsonResponse(200, {
				id: secondProjectId,
				name: "Review Film",
				step: "task",
				featureTree: FEATURE_TREE,
				codebase: null,
				snapshot: null,
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await exportPlan(secondProjectId, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(true);
		expect(result.featureDirectory).toBe("docs/vibeplan/review-film-bbbbbbbb");
		expect(readRepoFile(root, otherFeatureFile)).toBe("# PRD fitur lain\n");
		// The first feature's artifacts are still there too.
		expect(existsSync(join(root, ...`${FEATURE_DIR}/PRD.md`.split("/")))).toBe(
			true,
		);
	});

	it("works when the repository root contains spaces", async () => {
		const base = mkdtempSync(join(tmpdir(), "prdfy-export-plan-"));
		tempRoots.push(base);
		const root = join(base, "my project repo");
		mkdirSync(join(root, ".git"), { recursive: true });
		stubServer();
		silenceOutput();

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(result.ok).toBe(true);
		expect(readRepoFile(root, `${FEATURE_DIR}/feature.md`)).toContain(
			"React Movie App",
		);
	});

	it("leaves no temp files behind", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		const featureDir = join(root, ...FEATURE_DIR.split("/"));
		expect(
			readdirSync(featureDir).filter((name) => name.endsWith(".tmp")),
		).toEqual([]);
		expect(
			readdirSync(join(root, "docs", "vibeplan")).filter((name) =>
				name.endsWith(".tmp"),
			),
		).toEqual([]);
	});
});

describe("exportPlan output modes", () => {
	it("prints the result as JSON when --output json is used", async () => {
		const root = makeRepoRoot();
		stubServer();
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
		const parsed = JSON.parse(printed) as ExportPlanResult;
		expect(parsed.ok).toBe(true);
		expect(parsed.projectId).toBe(PROJECT_ID);
		expect(parsed.written).toHaveLength(6);
	});

	it("prints the re-export command in human output", async () => {
		const root = makeRepoRoot();
		stubServer();
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "human",
		});

		const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
		expect(printed).toContain(root);
		expect(printed).toContain(FEATURE_DIR);
		expect(printed).toContain(
			`everythings-vibe export plan ${PROJECT_ID} --root .`,
		);
		expect(printed).toContain("manifest.json");
	});

	it("reports a clear Indonesian error in human output on failure", async () => {
		const root = makeRepoRoot();
		stubServer({ prd: { status: 404, body: { error: "PRD not found" } } });
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await exportPlan(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "human",
		});

		expect(result.ok).toBe(false);
		const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
		expect(printed).toContain("Export gagal");
		expect(printed).toContain("PRD");
	});
});

describe("exportPlanCommand", () => {
	it("exits nonzero when the export fails", async () => {
		const root = makeRepoRoot();
		stubServer({ prd: { status: 404, body: { error: "PRD not found" } } });
		silenceOutput();
		// The mock always throws, so its inferred return type is `never` — the
		// same return type `process.exit` declares, with no cast needed.
		const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`exit:${code ?? ""}`);
		});

		await expect(
			exportPlanCommand(PROJECT_ID, {
				root,
				apiUrl: "http://localhost:3000",
				output: "json",
			}),
		).rejects.toThrow("exit:1");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("does not exit on a successful export", async () => {
		const root = makeRepoRoot();
		stubServer();
		silenceOutput();
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit should not be called on success");
		});

		await exportPlanCommand(PROJECT_ID, {
			root,
			apiUrl: "http://localhost:3000",
			output: "json",
		});

		expect(exitSpy).not.toHaveBeenCalled();
	});
});
