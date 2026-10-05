import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CodebaseAnalysis } from "@/lib/codebase-analysis";
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
	getCodebaseSessionRequestBody,
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
		expect(workspaceSource).toContain("eq(codebases.userId, user.id)");
	});

	it("recovers stored snapshot context instead of requiring a new sync session", () => {
		expect(workspaceSource).toContain("hasStoredSnapshot");
		expect(workspaceSource).toContain("storedSnapshot");
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
