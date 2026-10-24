import { describe, expect, it } from "vitest";
import {
	buildManifestEntry,
	buildReExportCommand,
	featurePlanDirectoryName,
	hashPlanContent,
	PLAN_EXPORT_MANIFEST_SCHEMA_VERSION,
	PlanExportError,
	type PlanExportInput,
	type PlanExportTask,
	planExportWrites,
	renderAcDocument,
	renderFeatureDocument,
	renderHandoffDocument,
	renderPrdDocument,
	renderTasksDocument,
	slugifyFeatureName,
} from "./plan-export.js";

const PRD_CONTENT = `# PRD Watchlist

## Requirements
- User bisa menambahkan film ke watchlist
- User bisa menandai film sudah ditonton

## User Flow
### Pages & Screens
- Watchlist Page
- Film Detail Page

## Tech Stack
- Frontend: React 19
`;

const AC_CONTENT = `# Acceptance Criteria

## Watchlist
- AC-1.1 User bisa menambahkan film ke watchlist
- AC-1.2 Watchlist kosong menampilkan empty state
`;

const TASKS: PlanExportTask[] = [
	{
		id: "task-11111111",
		name: "Bangun halaman watchlist",
		description: "Render daftar film tersimpan.",
		status: "pending",
		priority: "high",
		featureName: "Watchlist",
		dependencies: [],
		covers: ["AC-1.1", "AC-1.2"],
		surfaces: ["Watchlist Page"],
		startedAt: null,
		completedAt: null,
		subtasks: [
			{
				name: "Buat komponen list",
				description: "List film dengan empty state.",
				status: "pending",
				details: ["Gunakan data server", "Tangani state kosong"],
			},
		],
	},
	{
		id: "task-22222222",
		name: "Hubungkan ke API",
		description: "Ambil data watchlist dari server.",
		status: "in_progress",
		priority: "medium",
		featureName: "Watchlist",
		dependencies: ["task-11111111"],
		covers: ["AC-1.1"],
		surfaces: ["Film Detail Page"],
		startedAt: "2026-10-01T00:00:00.000Z",
		completedAt: null,
		subtasks: [],
	},
];

function makeInput(overrides: Partial<PlanExportInput> = {}): PlanExportInput {
	return {
		project: {
			id: "11111111-2222-3333-4444-555555555555",
			name: "Watchlist",
			step: "task",
		},
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
		featureTree: {
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
						{
							id: "sub-2",
							name: "Hapus dari watchlist",
							description: "Tombol hapus pada kartu film.",
						},
					],
				},
				{
					id: "feat-2",
					name: "Review Film",
					phase: 2,
					description: "Beri rating dan ulasan.",
					subfeatures: [
						{
							id: "sub-3",
							name: "Form review",
							description: "Input rating 1-5 dan komentar.",
						},
					],
				},
			],
		},
		prd: { content: PRD_CONTENT, version: 3 },
		ac: { content: AC_CONTENT, version: 2 },
		tasks: TASKS,
		...overrides,
	};
}

const EXPORTED_AT = "2026-10-10T00:00:00.000Z";

function writeContent(
	writes: ReturnType<typeof planExportWrites>,
	name: string,
) {
	const write = writes.find((entry) => entry.relativePath.endsWith(`/${name}`));
	if (!write) throw new Error(`missing planned write for ${name}`);
	return write.content;
}

describe("slugifyFeatureName", () => {
	it("lowercases, replaces separators, and trims edges", () => {
		expect(slugifyFeatureName("Watchlist")).toBe("watchlist");
		expect(slugifyFeatureName("Review Film")).toBe("review-film");
		expect(slugifyFeatureName("  Review   Film  ")).toBe("review-film");
		expect(slugifyFeatureName("User's Profile!")).toBe("user-s-profile");
		expect(slugifyFeatureName("--Watchlist--")).toBe("watchlist");
	});

	it("falls back to fitur when the name yields no usable characters", () => {
		expect(slugifyFeatureName("")).toBe("fitur");
		expect(slugifyFeatureName("   ")).toBe("fitur");
		expect(slugifyFeatureName("!!!")).toBe("fitur");
		expect(slugifyFeatureName("日本語")).toBe("fitur");
	});

	it("caps the slug length", () => {
		const slug = slugifyFeatureName("a".repeat(200));
		expect(slug.length).toBeLessThanOrEqual(60);
		expect(slug).toBe("a".repeat(60));
	});
});

describe("featurePlanDirectoryName", () => {
	it("includes the short project id so names are not the only identity", () => {
		const dir = featurePlanDirectoryName(
			"Watchlist",
			"11111111-2222-3333-4444-555555555555",
		);
		expect(dir).toBe("watchlist-11111111");
	});

	it("keeps similarly-named features with different ids apart", () => {
		const first = featurePlanDirectoryName(
			"Watchlist",
			"aaaaaaaa-1111-2222-3333",
		);
		const second = featurePlanDirectoryName(
			"Watchlist",
			"bbbbbbbb-1111-2222-3333",
		);

		expect(first).not.toBe(second);
		expect(first).toBe("watchlist-aaaaaaaa");
		expect(second).toBe("watchlist-bbbbbbbb");
	});

	it("takes the first 8 characters of the id, then strips non-alphanumerics", () => {
		// "AB-CD-EF" is the first 8 characters; "-" is removed after slicing.
		expect(featurePlanDirectoryName("Watchlist", "AB-CD-EF-GH-1234")).toBe(
			"watchlist-abcdef",
		);
		expect(featurePlanDirectoryName("Watchlist", "11111111-2222-3333")).toBe(
			"watchlist-11111111",
		);
	});

	it("falls back to the slug alone when the id has no usable characters", () => {
		expect(featurePlanDirectoryName("Watchlist", "--------")).toBe("watchlist");
		expect(featurePlanDirectoryName("Watchlist", "")).toBe("watchlist");
	});
});

describe("planExportWrites", () => {
	it("writes the manifest at the root and five artifacts in the feature dir", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const paths = writes.map((write) => write.relativePath);

		expect(paths).toEqual([
			"docs/vibeplan/watchlist-11111111/feature.md",
			"docs/vibeplan/watchlist-11111111/PRD.md",
			"docs/vibeplan/watchlist-11111111/AC.md",
			"docs/vibeplan/watchlist-11111111/tasks.json",
			"docs/vibeplan/watchlist-11111111/HANDOFF.md",
			"docs/vibeplan/manifest.json",
		]);
	});

	it("never writes an empty document", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		for (const write of writes) {
			expect(write.content.trim().length).toBeGreaterThan(0);
		}
	});

	it("throws naming the missing feature tree", () => {
		expect(() =>
			planExportWrites(makeInput({ featureTree: null }), {
				exportedAt: EXPORTED_AT,
			}),
		).toThrow(PlanExportError);

		try {
			planExportWrites(makeInput({ featureTree: null }), {
				exportedAt: EXPORTED_AT,
			});
		} catch (err) {
			expect(err).toBeInstanceOf(PlanExportError);
			const error = err as PlanExportError;
			expect(error.code).toBe("FEATURE_TREE_MISSING");
			expect(error.message).toContain("Feature Specification");
			expect(error.message).toContain("11111111-2222-3333-4444-555555555555");
		}
	});

	it("throws naming the missing PRD", () => {
		try {
			planExportWrites(makeInput({ prd: null }), { exportedAt: EXPORTED_AT });
			throw new Error("expected planExportWrites to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(PlanExportError);
			const error = err as PlanExportError;
			expect(error.code).toBe("PRD_MISSING");
			expect(error.message).toContain("PRD");
		}
	});

	it("throws naming the missing AC", () => {
		try {
			planExportWrites(makeInput({ ac: null }), { exportedAt: EXPORTED_AT });
			throw new Error("expected planExportWrites to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(PlanExportError);
			const error = err as PlanExportError;
			expect(error.code).toBe("AC_MISSING");
			expect(error.message).toContain("Acceptance Criteria");
		}
	});

	it("throws when there are no tasks", () => {
		try {
			planExportWrites(makeInput({ tasks: [] }), { exportedAt: EXPORTED_AT });
			throw new Error("expected planExportWrites to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(PlanExportError);
			const error = err as PlanExportError;
			expect(error.code).toBe("TASKS_MISSING");
			expect(error.message).toContain("Task");
		}
	});

	it("is deterministic for the same input and timestamp", () => {
		const first = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const second = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		expect(first).toEqual(second);
	});
});

describe("renderFeatureDocument", () => {
	it("contains every feature and subfeature with phase and description", () => {
		const md = renderFeatureDocument(makeInput());

		expect(md).toContain("React Movie App");
		expect(md).toContain("Watchlist");
		expect(md).toContain("Review Film");
		expect(md).toContain("Simpan film yang ingin ditonton.");
		expect(md).toContain("Beri rating dan ulasan.");
		expect(md).toContain("Tambah ke watchlist");
		expect(md).toContain("Hapus dari watchlist");
		expect(md).toContain("Form review");
		expect(md).toContain("Tombol simpan pada halaman detail.");
		expect(md).toContain("sub-3");
		expect(md).toContain("feat-2");
	});

	it("states explicitly when the tree has no features", () => {
		const md = renderFeatureDocument(
			makeInput({
				featureTree: {
					productName: "React Movie App",
					createdAt: "2026-09-30T00:00:00.000Z",
					features: [],
				},
			}),
		);

		expect(md).toContain("tidak memuat satu pun fitur");
	});
});

describe("renderPrdDocument / renderAcDocument", () => {
	it("includes the PRD content verbatim and untruncated", () => {
		const md = renderPrdDocument(makeInput());

		expect(md).toContain(PRD_CONTENT);
		expect(md).toContain("versi 3");
		expect(md).toContain("User bisa menambahkan film ke watchlist");
		expect(md).toContain("Watchlist Page");
		expect(md).toContain("Frontend: React 19");
	});

	it("includes the AC content verbatim and untruncated", () => {
		const md = renderAcDocument(makeInput());

		expect(md).toContain(AC_CONTENT);
		expect(md).toContain("versi 2");
		expect(md).toContain("AC-1.1");
		expect(md).toContain("AC-1.2");
	});

	it("keeps a very large PRD intact rather than truncating it", () => {
		const huge = `${PRD_CONTENT}\n${"baris panjang requirement\n".repeat(4000)}`;
		const md = renderPrdDocument(
			makeInput({ prd: { content: huge, version: 9 } }),
		);

		expect(md.length).toBeGreaterThan(huge.length);
		expect(md).toContain(huge);
		expect(md.endsWith("baris panjang requirement\n")).toBe(true);
	});
});

describe("renderTasksDocument", () => {
	it("carries dependencies, subtasks, covers, and surfaces", () => {
		const json: unknown = JSON.parse(
			renderTasksDocument(makeInput(), { exportedAt: EXPORTED_AT }),
		);
		expect(json).toMatchObject({
			projectId: "11111111-2222-3333-4444-555555555555",
			featureName: "Watchlist",
			exportedAt: EXPORTED_AT,
			taskCount: 2,
		});

		const payload = json as {
			tasks: Array<{
				id: string;
				dependencies: string[];
				covers: string[];
				surfaces: string[];
				subtasks: Array<{ name: string; details: string[] }>;
				startedAt: string | null;
				completedAt: string | null;
			}>;
		};

		expect(payload.tasks[1].dependencies).toEqual(["task-11111111"]);
		expect(payload.tasks[0].covers).toEqual(["AC-1.1", "AC-1.2"]);
		expect(payload.tasks[1].surfaces).toEqual(["Film Detail Page"]);
		expect(payload.tasks[0].subtasks[0].name).toBe("Buat komponen list");
		expect(payload.tasks[0].subtasks[0].details).toEqual([
			"Gunakan data server",
			"Tangani state kosong",
		]);
		expect(payload.tasks[1].startedAt).toBe("2026-10-01T00:00:00.000Z");
		expect(payload.tasks[1].completedAt).toBeNull();
	});

	it("preserves server values without inventing tasks", () => {
		const json = renderTasksDocument(makeInput(), { exportedAt: EXPORTED_AT });
		const payload = JSON.parse(json) as { tasks: Array<{ id: string }> };
		expect(payload.tasks.map((task) => task.id)).toEqual([
			"task-11111111",
			"task-22222222",
		]);
	});
});

describe("renderHandoffDocument", () => {
	it("names the real project id and the CLI task commands", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const md = renderHandoffDocument(makeInput(), {
			artifactFiles: writes.map((write) => write.relativePath),
			reExportCommand: buildReExportCommand(
				"11111111-2222-3333-4444-555555555555",
			),
		});

		expect(md).toContain("11111111-2222-3333-4444-555555555555");
		expect(md).toContain(
			"everythings-vibe task next 11111111-2222-3333-4444-555555555555",
		);
		expect(md).toContain(
			"everythings-vibe task update <taskId> --status in_progress",
		);
		expect(md).toContain(
			"everythings-vibe subtask update <taskId> --index <i> --status in_progress",
		);
		expect(md).toContain(
			"everythings-vibe kanban 11111111-2222-3333-4444-555555555555",
		);
	});

	it("covers the operational sections an agent needs", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const md = renderHandoffDocument(makeInput(), {
			artifactFiles: writes.map((write) => write.relativePath),
			reExportCommand: buildReExportCommand(
				"11111111-2222-3333-4444-555555555555",
			),
		});

		expect(md).toContain("PRD.md");
		expect(md).toContain("AC.md");
		expect(md).toContain("tasks.json");
		expect(md).toContain("feature.md");
		expect(md).toContain("dependencies");
		expect(md).toContain("covers");
		expect(md).toContain("surfaces");
		expect(md).toContain("snapshot");
		expect(md).toMatch(/source of truth|sumber kebenaran/i);
		expect(md).toContain("everythings-vibe export plan");
		expect(md).toMatch(/arsitektur/i);
		expect(md).toContain("AGENTS.md");
	});

	it("does not restate the whole PRD", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const md = renderHandoffDocument(makeInput(), {
			artifactFiles: writes.map((write) => write.relativePath),
			reExportCommand: buildReExportCommand(
				"11111111-2222-3333-4444-555555555555",
			),
		});

		expect(md).not.toContain(PRD_CONTENT);
		expect(md).not.toContain("User bisa menandai film sudah ditonton");
	});
});

describe("buildManifestEntry", () => {
	it("carries identity, artifacts, versions, snapshot, and the re-export command", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const manifest: unknown = JSON.parse(
			buildManifestEntry(makeInput(), {
				artifactFiles: writes.map((write) => write.relativePath),
				exportedAt: EXPORTED_AT,
			}),
		);

		expect(manifest).toMatchObject({
			schemaVersion: PLAN_EXPORT_MANIFEST_SCHEMA_VERSION,
			exportedAt: EXPORTED_AT,
			projectId: "11111111-2222-3333-4444-555555555555",
			projectName: "Watchlist",
			featureDirectory: "watchlist-11111111",
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
			reExportCommand:
				"everythings-vibe export plan 11111111-2222-3333-4444-555555555555 --root .",
		});

		const payload = manifest as {
			artifacts: Record<
				string,
				{ file: string; sha256: string; version?: number; taskCount?: number }
			>;
		};
		expect(Object.keys(payload.artifacts).sort()).toEqual([
			"ac",
			"feature",
			"handoff",
			"prd",
			"tasks",
		]);
		expect(payload.artifacts.prd.version).toBe(3);
		expect(payload.artifacts.ac.version).toBe(2);
		expect(payload.artifacts.tasks.taskCount).toBe(2);
		expect(payload.artifacts.feature.file).toBe(
			"docs/vibeplan/watchlist-11111111/feature.md",
		);
		for (const artifact of Object.values(payload.artifacts)) {
			expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("records a hash that matches the exported content", () => {
		const input = makeInput();
		const writes = planExportWrites(input, { exportedAt: EXPORTED_AT });
		const manifest = JSON.parse(
			buildManifestEntry(input, {
				artifactFiles: writes.map((write) => write.relativePath),
				exportedAt: EXPORTED_AT,
			}),
		) as { artifacts: { prd: { sha256: string } } };

		expect(manifest.artifacts.prd.sha256).toBe(
			hashPlanContent(writeContent(writes, "PRD.md")),
		);
	});

	it("contains no credential-like fields and no absolute local path", () => {
		const writes = planExportWrites(makeInput(), { exportedAt: EXPORTED_AT });
		const json = buildManifestEntry(makeInput(), {
			artifactFiles: writes.map((write) => write.relativePath),
			exportedAt: EXPORTED_AT,
		});

		expect(json).not.toMatch(/api[_-]?key/i);
		expect(json).not.toMatch(/token/i);
		expect(json).not.toMatch(/secret/i);
		expect(json).not.toMatch(/authorization/i);
		expect(json).not.toMatch(/bearer/i);
		expect(json).not.toMatch(/[A-Za-z]:\\\\/);
		expect(json).not.toContain("C:\\");
	});

	it("represents absent codebase and snapshot as null", () => {
		const input = makeInput({ codebase: null, snapshot: null });
		const writes = planExportWrites(input, { exportedAt: EXPORTED_AT });
		const manifest: unknown = JSON.parse(
			buildManifestEntry(input, {
				artifactFiles: writes.map((write) => write.relativePath),
				exportedAt: EXPORTED_AT,
			}),
		);

		expect(manifest).toMatchObject({ codebase: null, snapshot: null });
	});
});

describe("buildReExportCommand", () => {
	it("targets the same project id", () => {
		expect(buildReExportCommand("proj-abc")).toBe(
			"everythings-vibe export plan proj-abc --root .",
		);
	});
});
