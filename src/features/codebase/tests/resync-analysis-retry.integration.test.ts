import { afterEach, expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";
import { auth, request, seed } from "./resync-db-fixture";
import { analyzeSnapshot, uploadSnapshot } from "./resync-upload-fixture";

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("../services/analysis-server-generate", async () => {
	const { generatedAnalysis } = await import("./resync-upload-fixture");
	return { defaultGenerate: vi.fn(async () => generatedAnalysis()) };
});
afterEach(() => vi.restoreAllMocks());
test("workspace snapshot advances only with matching readable analysis and survives failure", async () => {
	const f = await seed();
	const { readWorkspaceSnapshot } = await import(
		"../services/workspace-snapshot.server"
	);
	const { readSyncStatusSnapshot } = await import(
		"../services/sync-status-snapshot.server"
	);
	const minted = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	const snapshotId = await uploadSnapshot(f.codebaseId, minted.syncToken);
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		f.snapshotId,
	);
	const generation = await import("../services/analysis-server-generate");
	vi.spyOn(generation, "defaultGenerate").mockRejectedValueOnce(
		new Error("Analysis fixture failure"),
	);
	const failed = await analyzeSnapshot(f.projectId, snapshotId);
	expect(failed.status).toBe(500);
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		f.snapshotId,
	);
	const completed = await analyzeSnapshot(f.projectId, snapshotId);
	expect(completed.status).toBe(200);
	const analysis = await completed.json();
	expect((await readWorkspaceSnapshot(f.userId, f.codebaseId))?.id).toBe(
		snapshotId,
	);
	const status = await readSyncStatusSnapshot({
		userId: f.userId,
		codebaseId: f.codebaseId,
		sessionId: minted.sessionId,
		projectId: f.projectId,
	});
	expect(status).toMatchObject({
		ok: true,
		snapshot: {
			sessionId: minted.sessionId,
			snapshotId,
			workspaceSnapshotId: snapshotId,
			analysisStatus: "ready",
		},
	});
	if (!status.ok) throw new Error("Current status missing");
	expect(status.snapshot.analysisId).toBe(analysis.id);
	expect(status.snapshot.analysisId).not.toBeNull();
}, 30000);
