import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CodebaseAnalysis } from "@/lib/codebase-analysis";

const workspaceLoaderSource = readFileSync(
	"src/features/codebase/services/workspace-loader.functions.ts",
	"utf8",
);

import {
	buildCodebaseLibraryItems,
	mapLibraryStatus,
} from "@/lib/codebase-library";
import { isValidHistoryUrl } from "@/lib/flow-progress";
import {
	selectLatestCodebaseSnapshots,
	selectLibraryAnalysisSlice,
	selectNewestFeatureProjectIdPerCodebase,
} from "../codebases/index";
import {
	buildAskHandoffAnswers,
	canRenderCodebaseReview,
	decideCodebaseDetailEntry,
	describeArtifactReadFailure,
	formatCodebaseSyncBadge,
	getCodebaseSessionRequestBody,
	resolveWorkspaceSnapshotReady,
	toSourcePreviewState,
} from "./$id";

describe("decideCodebaseDetailEntry", () => {
	it("allows a present codebase id", () => {
		expect(decideCodebaseDetailEntry("c1")).toBe("allow");
	});

	it("denies a missing id", () => {
		expect(decideCodebaseDetailEntry(undefined)).toBe("deny");
		expect(decideCodebaseDetailEntry("")).toBe("deny");
	});
});

describe("artifact read failure classification", () => {
	it("names an expired session distinctly from a missing document", () => {
		const unauthorized = describeArtifactReadFailure("Dokumen PRD", 401);
		const missing = describeArtifactReadFailure("Dokumen PRD", 404);
		expect(unauthorized).not.toBe(missing);
		expect(unauthorized).toContain("Sesi");
		expect(missing).toContain("tidak ditemukan");
	});

	it("treats forbidden reads the same as an expired session", () => {
		expect(describeArtifactReadFailure("Dokumen AC", 403)).toBe(
			describeArtifactReadFailure("Dokumen AC", 401),
		);
	});

	it("reports a transient server failure without claiming the artifact is empty", () => {
		const message = describeArtifactReadFailure("Dokumen PRD", 500);
		expect(message).toContain("Dokumen PRD");
		expect(message).toContain("Coba lagi");
		expect(message).not.toContain("kosong");
	});
});

describe("history url validation after the route change", () => {
	const id = "11111111-1111-1111-1111-111111111111";

	it("still accepts project routes", () => {
		expect(isValidHistoryUrl(`/prd/${id}`, id)).toBe(true);
		expect(isValidHistoryUrl(`/task/${id}`, id)).toBe(true);
	});

	it("rejects the removed singular codebase route", () => {
		expect(isValidHistoryUrl(`/codebase/${id}`, id)).toBe(false);
	});

	it("accepts the new codebases list route", () => {
		expect(isValidHistoryUrl("/codebases", id)).toBe(true);
	});
});

describe("codebase session request actions", () => {
	it("uses an explicit retry action for every retry request", () => {
		expect(getCodebaseSessionRequestBody("retry")).toEqual({
			action: "retry",
		});
	});

	it("keeps initial session creation as an empty request body", () => {
		expect(getCodebaseSessionRequestBody("initial")).toEqual({});
	});
});

describe("codebase review snapshot pairing", () => {
	const output = {
		projectId: "project-1",
		snapshotId: "snapshot-1",
	} satisfies CodebaseAnalysis;
	const analysis = {
		snapshotId: "snapshot-1",
		output,
	};

	it("waits for a usable status snapshot before allowing review", () => {
		expect(canRenderCodebaseReview(analysis, null)).toBe(false);
		expect(
			canRenderCodebaseReview(analysis, {
				status: "waiting_for_cli",
				snapshotId: "snapshot-1",
			}),
		).toBe(false);
	});

	it("requires the analysis and status to refer to the same snapshot", () => {
		expect(
			canRenderCodebaseReview(analysis, {
				status: "uploaded",
				snapshotId: "snapshot-2",
			}),
		).toBe(false);
		expect(
			canRenderCodebaseReview(analysis, {
				status: "uploaded",
				snapshotId: "snapshot-1",
			}),
		).toBe(true);
	});
});

describe("codebase list ownership boundary", () => {
	const source = readFileSync("src/routes/codebases/index.tsx", "utf8");

	it("scopes the library loader to the authenticated user", () => {
		expect(source).toContain("requireUserServer()");
		expect(source).toContain("eq(codebases.userId, userId)");
	});

	it("scopes snapshot and feature lookups to the same owner", () => {
		expect(source).toContain("eq(projects.userId, userId)");
		expect(source).toContain("isNull(projects.deletedAt)");
	});

	it("renders the persisted library instead of minting a codebase on mount", () => {
		expect(source).toContain("CodebaseLibraryView");
		expect(source).not.toContain('fetch("/api/codebases"');
	});

	it("renders the persisted codebase name so an auto-named project shows its repository", () => {
		// `codebases.name` is the canonical display name: once the CLI has
		// replaced the placeholder at handshake, the library must show that
		// value with no page-specific alias or second naming source.
		expect(source).toContain("name: codebases.name");
	});

	it("keeps the library off any client-side placeholder fallback", () => {
		expect(source).not.toContain("Repository Lokal");
	});
});

describe("codebase list snapshot selection", () => {
	it("keeps the newest failed snapshot visible instead of using an older usable one", () => {
		const latest = selectLatestCodebaseSnapshots([
			{
				id: "snapshot-old",
				codebaseId: "codebase-1",
				createdAt: new Date("2026-09-22T10:00:00.000Z"),
				commitSha: "old",
				fileCount: 4,
				status: "uploaded",
			},
			{
				id: "snapshot-new",
				codebaseId: "codebase-1",
				createdAt: new Date("2026-09-23T10:00:00.000Z"),
				commitSha: "new",
				fileCount: 5,
				status: "failed",
			},
		]);

		expect(latest.get("codebase-1")).toMatchObject({
			id: "snapshot-new",
			status: "failed",
		});
	});

	it("ignores snapshots that are not bound to a codebase", () => {
		const latest = selectLatestCodebaseSnapshots([
			{
				id: "snapshot-legacy",
				codebaseId: null,
				createdAt: new Date("2026-09-22T10:00:00.000Z"),
				commitSha: "legacy",
				fileCount: 4,
				status: "uploaded",
			},
		]);

		expect(latest.size).toBe(0);
	});

	it("returns no latest snapshot for a codebase that never synced", () => {
		const latest = selectLatestCodebaseSnapshots([]);
		expect(latest.size).toBe(0);
	});
});

describe("existing-codebase workspace re-entry", () => {
	const workspaceSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");

	it("keeps ownership enforced on the workspace read", () => {
		expect(workspaceLoaderSource).toContain("eq(codebases.userId, user.id)");
	});

	it("recovers stored snapshot context instead of requiring a new sync session", () => {
		expect(workspaceSource).toContain("hasStoredSnapshot");
		expect(workspaceLoaderSource).toContain("storedSnapshot");
	});

	it("opens the workspace without minting a new sync session on load", () => {
		const loaderStart = workspaceSource.indexOf(
			'createFileRoute("/codebases/$id")',
		);
		const loaderEnd = workspaceSource.indexOf("head:", loaderStart);
		expect(loaderStart).toBeGreaterThan(-1);
		expect(loaderEnd).toBeGreaterThan(loaderStart);
		expect(workspaceSource.slice(loaderStart, loaderEnd)).not.toContain(
			"/session",
		);
	});

	it("derives workspace entry from the snapshot, never from analysis", () => {
		// Sync completion is transport-only: a usable snapshot opens the
		// workspace. AI analysis must never gate entry, so no analysis status
		// may appear in the snapshotReady derivation.
		const start = workspaceSource.indexOf("const snapshotReady");
		const end = workspaceSource.indexOf("const [activeFeature", start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const derivation = workspaceSource.slice(start, end);
		expect(derivation).toContain("hasStoredSnapshot");
		expect(derivation).not.toContain("analysisStatus");
		expect(derivation).not.toContain("analysis");
	});

	it("does not gate workspace rendering on validated analysis output", () => {
		// `if (snapshotReady)` selects the workspace; analysis output only
		// feeds optional panels inside it.
		const branch = workspaceSource.indexOf("if (snapshotReady) {");
		expect(branch).toBeGreaterThan(-1);
		const branchSlice = workspaceSource.slice(branch, branch + 400);
		expect(branchSlice).not.toContain("analysisOutput");
	});
});

describe("greenfield history separation", () => {
	const historySource = readFileSync("src/lib/history.ts", "utf8");

	it("keeps history scoped to projects and never reads codebase rows", () => {
		expect(historySource).toContain("projects");
		expect(historySource).not.toContain("codebases");
	});

	it("keeps the greenfield workspace filter intact", () => {
		expect(historySource).toContain('eq(projects.projectMode, "greenfield")');
	});
});

describe("selectNewestFeatureProjectIdPerCodebase", () => {
	it("keeps the newest feature project per codebase", () => {
		const map = selectNewestFeatureProjectIdPerCodebase([
			{ id: "feature-new", codebaseId: "cb-1" },
			{ id: "feature-old", codebaseId: "cb-1" },
			{ id: "feature-other", codebaseId: "cb-2" },
		]);

		expect(map.get("cb-1")).toBe("feature-new");
		expect(map.get("cb-2")).toBe("feature-other");
	});

	it("skips projects not bound to a codebase", () => {
		const map = selectNewestFeatureProjectIdPerCodebase([
			{ id: "greenfield", codebaseId: null },
		]);

		expect(map.size).toBe(0);
	});
});

describe("selectLibraryAnalysisSlice", () => {
	it("pairs analysis only with the newest snapshot", () => {
		const analyses = [
			{ projectId: "p1", snapshotId: "snap-old" },
			{ projectId: "p1", snapshotId: "snap-new" },
		];

		expect(selectLibraryAnalysisSlice("snap-new", analyses)).toEqual({
			projectId: "p1",
			snapshotId: "snap-new",
		});
	});

	it("returns null when the newest snapshot has no analysis", () => {
		expect(
			selectLibraryAnalysisSlice("snap-new", [
				{ projectId: "p1", snapshotId: "snap-old" },
			]),
		).toBeNull();
	});

	it("returns null when no snapshot exists", () => {
		expect(
			selectLibraryAnalysisSlice(null, [
				{ projectId: "p1", snapshotId: "snap-old" },
			]),
		).toBeNull();
	});
});

describe("codebase list filtering gate", () => {
	const source = readFileSync("src/routes/codebases/index.tsx", "utf8");

	it("builds library rows through the canonical readiness helper instead of mapping every owned row", () => {
		expect(source).toContain("buildCodebaseLibraryItems");
		expect(source).not.toContain("analysisOutputByProject");
	});

	it("pulls analysis status into the row so the readiness helper can inspect it", () => {
		expect(source).toContain("status: codebaseAnalyses.status");
		expect(source).not.toContain('eq(codebaseAnalyses.status, "ready")');
	});
});

describe("codebase library readiness vs workspace availability", () => {
	// Readiness is a persistence question: a codebase with a usable snapshot is
	// listed, and analysis progress is reported as its own signal. Previously the
	// library required a ready analysis, so a repository whose analysis was still
	// running (or had failed) disappeared from Project Tersimpan even though its
	// workspace and planning were perfectly usable.
	it("lists a synced codebase whose analysis is still pending", () => {
		const items = buildCodebaseLibraryItems({
			codebases: [
				{
					id: "cb-pending",
					name: "Pending Repo",
					createdAt: new Date("2026-09-23T10:00:00.000Z"),
					updatedAt: new Date("2026-09-23T10:00:00.000Z"),
				},
			],
			snapshots: [
				{
					id: "snap-pending",
					codebaseId: "cb-pending",
					createdAt: new Date("2026-09-23T10:00:00.000Z"),
					fileCount: 37,
					status: "uploaded",
				},
			],
			projects: [{ id: "proj-pending", codebaseId: "cb-pending" }],
			analyses: [
				{
					projectId: "proj-pending",
					snapshotId: "snap-pending",
					status: "pending",
					output: null,
				},
			],
		});

		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("cb-pending");
		// The analysis signal stays honest: listed, but not analysed yet.
		expect(items[0].hasReadyAnalysis).toBe(false);
		expect(items[0].hasUsableSnapshot).toBe(true);
		expect(mapLibraryStatus(items[0].snapshotStatus, false)).toBe("Tersinkron");
	});

	it("still hides a codebase that never produced a usable snapshot", () => {
		const items = buildCodebaseLibraryItems({
			codebases: [
				{
					id: "cb-uploading",
					name: "Uploading Repo",
					createdAt: new Date("2026-09-23T10:00:00.000Z"),
					updatedAt: new Date("2026-09-23T10:00:00.000Z"),
				},
			],
			snapshots: [
				{
					id: "snap-uploading",
					codebaseId: "cb-uploading",
					createdAt: new Date("2026-09-23T10:00:00.000Z"),
					fileCount: 0,
					status: "uploading",
				},
			],
			projects: [{ id: "proj-uploading", codebaseId: "cb-uploading" }],
			analyses: [],
		});

		expect(items).toHaveLength(0);
	});

	it("lists the codebase once validated analysis for that snapshot exists", () => {
		const items = buildCodebaseLibraryItems({
			codebases: [
				{
					id: "cb-ready",
					name: "Ready Repo",
					createdAt: new Date("2026-09-23T10:00:00.000Z"),
					updatedAt: new Date("2026-09-23T10:00:00.000Z"),
				},
			],
			snapshots: [
				{
					id: "snap-ready",
					codebaseId: "cb-ready",
					createdAt: new Date("2026-09-23T10:00:00.000Z"),
					fileCount: 37,
					status: "uploaded",
				},
			],
			projects: [{ id: "proj-ready", codebaseId: "cb-ready" }],
			analyses: [
				{
					projectId: "proj-ready",
					snapshotId: "snap-ready",
					status: "ready",
					output: {
						projectId: "proj-ready",
						snapshotId: "snap-ready",
						framework: "TanStack Start",
						language: "TypeScript",
					},
				},
			],
		});

		expect(items).toHaveLength(1);
		expect(items[0]?.hasReadyAnalysis).toBe(true);
	});
});

describe("codebase detail incomplete sync handling", () => {
	const detailSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");

	it("renders ScreenConnect only when a payload or loading state exists", () => {
		expect(detailSource).toContain("payload !== null || isStarting");
		expect(detailSource).toContain("ScreenIncompleteSync");
	});

	it("exposes a restart-sync recovery control wired to the canonical session endpoint", () => {
		expect(detailSource).toContain('startSession("retry")');
		expect(detailSource).toContain("ScreenIncompleteSync");
		const component = readFileSync(
			"src/components/codebase/screen-incomplete-sync.tsx",
			"utf8",
		);
		expect(component).toContain("Repository belum selesai disinkronkan");
		expect(component).toContain("Mulai ulang sync");
	});
});

describe("ask options repository grounding", () => {
	const askOptionsSource = readFileSync(
		"src/routes/api/ask/options.ts",
		"utf8",
	);

	it("fails closed when repository context cannot be read", () => {
		// A repository-aware question set must never be generated without the
		// snapshot context: an unexpected context failure returns an error
		// instead of quietly continuing with generic questions.
		expect(askOptionsSource).toContain("CODEBASE_CONTEXT_UNAVAILABLE");
		expect(askOptionsSource).not.toContain(
			'console.warn("ask codebase context skipped:"',
		);
		expect(askOptionsSource).toMatch(
			/required = await requireProjectGenerationContext\(projectId\)/,
		);
	});

	it("appends the bounded repository block to the prompt", () => {
		expect(askOptionsSource).toContain(
			"codebaseBlock = buildCodebasePromptBlock(required.context)",
		);
		expect(askOptionsSource).toMatch(/systemPrompt[\s\S]*\$\{codebaseBlock\}/);
	});

	it("uses the repository-aware product prompt only for existing codebases", () => {
		expect(askOptionsSource).toContain(
			"ASK_CODEBASE_OPTIONS_GENERATION_PROMPT",
		);
		expect(askOptionsSource).toContain("ASK_OPTIONS_GENERATION_PROMPT");
		expect(askOptionsSource).toMatch(
			/project\.projectMode === "existing_codebase"[\s\S]*ASK_CODEBASE_OPTIONS_GENERATION_PROMPT/,
		);
	});
});

describe("workspace resume after refresh", () => {
	const workspaceSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");

	it("derives the resume stage from persisted artifacts, not from a guess", () => {
		expect(workspaceSource).toContain("resolvePersistedStage({");
		expect(workspaceSource).toMatch(/feature: hydration\.feature/);
		expect(workspaceSource).toMatch(/prd: hydration\.prd/);
		expect(workspaceSource).toMatch(/ac: hydration\.ac/);
		expect(workspaceSource).toMatch(/tasks: hydration\.tasks/);
	});

	it("reconciles the visible stage forward only, never rewinding it", () => {
		// A late artifact load must not pull a project that already advanced
		// back to an earlier stage while the user is working.
		expect(workspaceSource).toContain("reconcilePipelineStage(");
		expect(workspaceSource).toMatch(
			/setPipelineStage\(\(current\) =>\s*reconcilePipelineStage\(current, persistedStage\)/,
		);
	});

	it("binds every artifact read to the project that started it", () => {
		// A response for a plan the user already left must be dropped instead of
		// overwriting the plan now on screen.
		expect(workspaceSource).toContain("activeProjectIdRef");
		expect(workspaceSource).toMatch(
			/if \(activeProjectIdRef\.current !== requestedProjectId\) return null/,
		);
		expect(workspaceSource).toMatch(
			/if \(activeProjectIdRef\.current !== projectId\) return null/,
		);
	});

	it("never offers the Task step before tasks are proven absent", () => {
		expect(workspaceSource).toContain(
			'tasksUnresolved={hydration.tasks !== "empty"}',
		);
	});

	it("never runs two pipeline generations at once", () => {
		expect(workspaceSource).toContain("stageRunInFlight");
		expect(workspaceSource).toMatch(
			/if \(!effectiveFeatureId \|\| stageBusy \|\| stageRunInFlight\.current\) return/,
		);
	});
});

describe("automatic artifact preview", () => {
	const workspaceSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");

	it("reveals an artifact only after the server state was reloaded", () => {
		// Each reveal sits in the success branch of a loader that had to return
		// real content first, so no reveal can be reached from a failure path.
		const feature = workspaceSource.slice(
			workspaceSource.indexOf("const handleConfirmGenerate"),
			workspaceSource.indexOf("const runPipelineStage"),
		);
		expect(feature).toMatch(
			/reloadFeatureTree: \(\) => refreshFeatureTree[\s\S]*?openArtifactPreview\("feature"\)/,
		);

		const prd = workspaceSource.slice(
			workspaceSource.indexOf("const handleGeneratePrd"),
			workspaceSource.indexOf("const handleGenerateAc"),
		);
		expect(prd).toMatch(
			/const content = await loadPrd\(\)[\s\S]*?if \(!content\)[\s\S]*?return false;[\s\S]*?openArtifactPreview\("prd"\)/,
		);

		const ac = workspaceSource.slice(
			workspaceSource.indexOf("const handleGenerateAc"),
			workspaceSource.indexOf("const handleGenerateTask"),
		);
		expect(ac).toMatch(
			/const content = await loadAc\(\)[\s\S]*?if \(!content\)[\s\S]*?return false;[\s\S]*?openArtifactPreview\("ac"\)/,
		);

		const task = workspaceSource.slice(
			workspaceSource.indexOf("const handleGenerateTask"),
			workspaceSource.indexOf("const handleRetryStage"),
		);
		expect(task).toMatch(
			/const persistedTaskTree = await refreshTaskTree[\s\S]*?if \(!persistedTaskTree\)[\s\S]*?return false;[\s\S]*?openArtifactPreview\("tasks"\)/,
		);

		// A revision reveals the PRD only after the document reloaded.
		const revision = workspaceSource.slice(
			workspaceSource.indexOf("const runRevision"),
			workspaceSource.indexOf("const handleConfirmGenerate"),
		);
		expect(revision).toMatch(
			/const content = await loadPrd\(\)[\s\S]*?if \(!content\)[\s\S]*?openArtifactPreview\("prd"\)/,
		);
	});

	it("never moves the canvas after the user takes it over", () => {
		expect(workspaceSource).toContain("userTookOverCanvas");
		// Both a manual artifact open and a manual close hand the panel to the
		// user, so a later automatic reveal stands down.
		expect(workspaceSource).toMatch(
			/onOpenArtifact=\{\(artifact\)[\s\S]*?userTookOverCanvas\.current = true/,
		);
		expect(workspaceSource).toMatch(
			/onClose=\{\(\)[\s\S]*?userTookOverCanvas\.current = true/,
		);
	});
});

describe("composer message routing without intent choice", () => {
	const workspaceSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");
	const chatSource = readFileSync("src/routes/api/chat.ts", "utf8");

	it("routes a message by workspace state instead of a per-message choice", () => {
		// No persistent intent card, no radio gate, no inferred choice.
		expect(workspaceSource).not.toContain("CodebaseChatIntent");
		expect(workspaceSource).not.toContain("resolveIntentOptions");
		expect(workspaceSource).not.toContain("CodebaseIntentChoice");
		expect(workspaceSource).not.toContain("selectedIntent");
		expect(workspaceSource).not.toContain("needsIntentChoice");
		// A message in a plan with planning revises that same plan.
		expect(workspaceSource).toMatch(
			/activeHasPlanning[\s\S]*await runRevision\(trimmed\)/,
		);
		// A new feature still goes through the existing creation path.
		expect(workspaceSource).toContain("ensureFeatureInWorkspace(trimmed)");
	});

	it("creates a new plan only from the explicit create action", () => {
		expect(workspaceSource).toContain("isCreatingNew");
		expect(workspaceSource).toContain("handleCreateFeature");
		expect(workspaceSource).toContain("onCreateFeature");
		expect(workspaceSource).toContain("setIsCreatingNew(false)");
	});

	it("keeps a revision on the existing append-only versioning path", () => {
		expect(workspaceSource).toMatch(/mode: "revise"/);
		// The revision reuses /api/chat, so no parallel versioning system exists.
		expect(workspaceSource).not.toMatch(/\/api\/[a-z-]*revision/);
		// Success is only reported after the document is readable again.
		expect(workspaceSource).toMatch(
			/runRevision[\s\S]*const content = await loadPrd\(\)[\s\S]*if \(!content\)/,
		);
	});

	it("never resets task progress as part of a revision", () => {
		const revisionBlock = workspaceSource.slice(
			workspaceSource.indexOf("const runRevision = useCallback("),
		);
		const body = revisionBlock.slice(
			0,
			revisionBlock.indexOf("const handleSendMessage"),
		);
		expect(body).not.toContain("refreshTaskTree");
		expect(body).not.toContain("/api/task/generate");
		expect(body).not.toContain("reset-progress");
	});

	it("gates a locked-document revision behind an explicit confirmation", () => {
		// The lock still blocks a silent revision, and only an explicit
		// confirmation lifts it for that request.
		expect(chatSource).toMatch(
			/isPrdLocked\(projCheck\?\.step\) && !confirmedImpact/,
		);
		expect(chatSource).toContain("confirmedImpact");
		expect(workspaceSource).toContain("confirmedImpact: true");
	});

	it("computes the task impact from the real Kanban rows", () => {
		expect(workspaceSource).toContain("assessRevisionImpact");
		expect(workspaceSource).toContain("describeRevisionImpact(revisionImpact)");
		expect(workspaceSource).toMatch(/kanban\.data\?\.columns/);
	});

	it("reports a locked document instead of silently rewriting it", () => {
		expect(chatSource).toContain("PRD_LOCKED");
		expect(chatSource).toMatch(/Dokumen PRD telah dikunci \(Read-Only\)/);
	});
});

describe("buildAskHandoffAnswers", () => {
	it("maps answer map to question title and answer list conforming to askHandoffAnswerSchema", () => {
		const questions = [
			{ id: "q1", title: "Bagaimana arsitekturnya?", options: [] },
			{ id: "q2", title: "Bagaimana UI feedback?", options: [] },
		];
		const answers = {
			q1: "Postgres",
			q2: "Toast",
		};
		const result = buildAskHandoffAnswers(answers, questions);
		expect(result).toEqual([
			{ question: "Bagaimana arsitekturnya?", answer: "Postgres" },
			{ question: "Bagaimana UI feedback?", answer: "Toast" },
		]);
	});

	it("falls back to questionId if not found in questions list", () => {
		const result = buildAskHandoffAnswers({ customQ: "My answer" }, []);
		expect(result).toEqual([{ question: "customQ", answer: "My answer" }]);
	});

	it("filters out empty answers", () => {
		const result = buildAskHandoffAnswers({ q1: "   ", q2: "Valid" }, []);
		expect(result).toEqual([{ question: "q2", answer: "Valid" }]);
	});
});

describe("codebase detail pending skeleton fidelity", () => {
	const detailSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");

	it("uses CodebaseDetailPending as pendingComponent and renders CodebaseWorkspaceSkeleton", () => {
		expect(detailSource).toContain("pendingComponent: CodebaseDetailPending");
		expect(detailSource).toContain("CodebaseWorkspaceSkeleton");
	});

	it("does not render generic max-w-4xl centered card or h-64 box in pending skeleton", () => {
		const skeletonSource = readFileSync(
			"src/components/codebase/codebase-workspace-skeleton.tsx",
			"utf8",
		);
		expect(skeletonSource).not.toContain("max-w-4xl");
		expect(skeletonSource).not.toContain("h-64");
	});
});

describe("codebase starter suggestions route wiring", () => {
	const detailSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");

	it("passes validated suggestions from the loaded analysis output to the workspace", () => {
		expect(detailSource).toContain(
			"starterSuggestions={analysisOutput?.starterSuggestions}",
		);
	});
});

describe("read-only source preview contract", () => {
	const detailSource = readFileSync("src/routes/codebases/$id.tsx", "utf8");
	const snapshotSource = readFileSync(
		"src/features/codebase/services/workspace-snapshot.functions.ts",
		"utf8",
	);
	const previewSource = snapshotSource.slice(
		snapshotSource.indexOf("export const loadSnapshotFileContent"),
	);

	it("binds every read to the authenticated owner of the codebase", () => {
		expect(previewSource).toContain("await requireUserServer()");
		expect(previewSource).toContain("eq(codebases.userId, user.id)");
		expect(previewSource).toContain(
			'if (!codebase) throw new Error("NOT_FOUND")',
		);
	});

	it("derives the snapshot from the codebase and never from the request", () => {
		expect(previewSource).toContain(
			"eq(codebaseSnapshots.codebaseId, input.codebaseId)",
		);
		expect(previewSource).toContain(
			"inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES])",
		);
		// A caller-supplied snapshot id must never reach the query.
		expect(previewSource).not.toContain("eq(codebaseSnapshots.id,");
		expect(previewSource).not.toContain("input.snapshotId");
	});

	it("validates the requested path and requires it in the stored manifest", () => {
		expect(previewSource).toContain("if (!isSafeRelativePath(requestedPath))");
		expect(previewSource).toContain("manifestEntrySchema");
		expect(previewSource).toContain("parsedManifest.data.find(");
		expect(previewSource).toContain(
			"eq(codebaseSnapshotFiles.snapshotId, snapshot.id)",
		);
		expect(previewSource).toContain(
			"eq(codebaseSnapshotFiles.path, requestedPath)",
		);
	});

	it("rejects incomplete chunk sets instead of rendering partial content", () => {
		expect(previewSource).toContain("assembleSnapshotFileChunks(rows)");
		expect(previewSource).toContain(
			"if (!assembled || !isStrictBase64(assembled))",
		);
	});

	it("bounds the response and separates unsupported content from missing files", () => {
		expect(previewSource).toContain("truncatePreviewContent(");
		expect(previewSource).toContain("CODEBASE_FILE_PREVIEW_MAX_CHARS");
		expect(previewSource).toContain("isDisplayableTextContent(decoded)");
		expect(previewSource).toContain('status: "unsupported"');
		expect(previewSource).toContain('status: "unavailable"');
	});

	it("drops in-flight and previously selected content when the snapshot changes", () => {
		expect(detailSource).toContain("const appliedSnapshotRef = useRef");
		expect(detailSource).toContain(
			"sourcePreviewRequestRef.current !== requestId",
		);
		expect(detailSource).toContain("result.snapshotId !== activeSnapshotId");
	});

	it("shares the existing right panel with artifacts and never mixes them", () => {
		expect(detailSource).toContain(
			'const isSourcePreviewOpen = sourcePreview.kind !== "idle"',
		);
		expect(detailSource).toContain("onSelectFile={selectSourceFile}");
		expect(detailSource).toContain("clearSourcePreview();");
		// Every artifact branch is gated off while a source file is open, so a
		// stale document render can never sit next to stale source text.
		expect(detailSource).toContain("!isSourcePreviewOpen && activeArtifact");
		expect(detailSource.split("!isSourcePreviewOpen &&").length - 1).toBe(5);
		expect(detailSource).toContain("<CodebaseSourcePreview");
		expect(detailSource).toContain('? "SUMBER"');
	});
});

describe("toSourcePreviewState", () => {
	it("keeps real content for a readable snapshot file", () => {
		expect(
			toSourcePreviewState(
				{
					status: "ok",
					snapshotId: "snap_1",
					path: "src/app.ts",
					content: "const a = 1;",
					truncated: true,
					sizeBytes: 12,
				},
				"src/app.ts",
			),
		).toEqual({
			kind: "ready",
			path: "src/app.ts",
			content: "const a = 1;",
			truncated: true,
			sizeBytes: 12,
		});
	});

	it("never renders an empty file as readable source", () => {
		expect(
			toSourcePreviewState(
				{
					status: "ok",
					snapshotId: "snap_1",
					path: "src/empty.ts",
					content: "",
					truncated: false,
					sizeBytes: 0,
				},
				"src/empty.ts",
			),
		).toEqual({ kind: "unavailable", path: "src/empty.ts" });
	});

	it("distinguishes non-text content from a path the snapshot never stored", () => {
		expect(
			toSourcePreviewState(
				{
					status: "unsupported",
					snapshotId: "snap_1",
					path: "logo.png",
					sizeBytes: 10,
				},
				"logo.png",
			),
		).toEqual({ kind: "unsupported", path: "logo.png" });
		expect(
			toSourcePreviewState(
				{ status: "unavailable", snapshotId: null, path: "../../etc/passwd" },
				"../../etc/passwd",
			),
		).toEqual({ kind: "unavailable", path: "../../etc/passwd" });
	});
});

describe("workspace onboarding analysis selection", () => {
	const detailSource = workspaceLoaderSource;

	it("loads analysis by the immutable onboarding anchor and active snapshot", () => {
		expect(detailSource).toContain(
			"onboardingProjectId: codebases.onboardingProjectId",
		);
		expect(detailSource).toContain("resolveOnboardingAnchorProject");
		expect(detailSource).toContain(
			"eq(codebaseAnalyses.projectId, onboardingFeature.id)",
		);
		expect(detailSource).toContain(
			"eq(codebaseAnalyses.snapshotId, currentSnapshot.id)",
		);
	});

	it("selects the latest usable snapshot regardless of file count", () => {
		expect(detailSource).toContain(
			"inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES])",
		);
		expect(detailSource).not.toContain("gt(codebaseSnapshots.fileCount, 0)");
	});
});

describe("formatCodebaseSyncBadge", () => {
	it("formats 0 files as '0 file tersinkron'", () => {
		expect(formatCodebaseSyncBadge(0)).toBe("0 file tersinkron");
	});

	it("formats positive file counts", () => {
		expect(formatCodebaseSyncBadge(42)).toBe("42 file tersinkron");
	});

	it("falls back to 'Menunggu snapshot' when count is null or undefined", () => {
		expect(formatCodebaseSyncBadge(null)).toBe("Menunggu snapshot");
		expect(formatCodebaseSyncBadge(undefined)).toBe("Menunggu snapshot");
	});
});

describe("resolveWorkspaceSnapshotReady", () => {
	it("opens workspace on expired session when usable stored snapshot exists (including empty snapshots)", () => {
		expect(
			resolveWorkspaceSnapshotReady({
				status: { status: "expired", snapshotId: "snap-empty" },
				hasStoredSnapshot: true,
			}),
		).toBe(true);
	});

	it("blocks workspace when expired session has no stored snapshot", () => {
		expect(
			resolveWorkspaceSnapshotReady({
				status: { status: "expired", snapshotId: "snap-empty" },
				hasStoredSnapshot: false,
			}),
		).toBe(false);
	});

	it("opens workspace when session status is in SNAPSHOT_CONTEXT_STATUSES regardless of stored snapshot", () => {
		expect(
			resolveWorkspaceSnapshotReady({
				status: { status: "uploaded", snapshotId: "snap-1" },
				hasStoredSnapshot: false,
			}),
		).toBe(true);
		expect(
			resolveWorkspaceSnapshotReady({
				status: { status: "ready", snapshotId: "snap-1" },
				hasStoredSnapshot: false,
			}),
		).toBe(true);
	});

	it("handles missing status cleanly", () => {
		expect(
			resolveWorkspaceSnapshotReady({
				status: null,
				hasStoredSnapshot: true,
			}),
		).toBe(true);
		expect(
			resolveWorkspaceSnapshotReady({
				status: null,
				hasStoredSnapshot: false,
			}),
		).toBe(false);
	});
});
