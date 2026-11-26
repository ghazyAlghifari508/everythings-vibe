import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import "./analysis-credit-db-fixture";
import {
	isResyncSessionVerified,
	syncStatusResponseSchema,
} from "../services/sync";
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
	return { defaultGenerate: async () => generatedAnalysis() };
});

test("polling and SSE agree on the current attempt from waiting through verified completion without exposing credentials", async () => {
	const f = await seed();
	const { handleCodebaseSyncStatus } = await import(
		"../services/sync-status.server"
	);
	const { handleCodebaseSyncStream } = await import(
		"../services/sync-progress-stream.server"
	);
	const accepted = await (
		await request(f.codebaseId, {
			action: "resync",
			requestId: crypto.randomUUID(),
		})
	).json();
	const read = async (sessionId: string) => {
		const query = new URLSearchParams({ sessionId, projectId: f.projectId });
		const status = await handleCodebaseSyncStatus({
			params: { codebaseId: f.codebaseId },
			request: new Request(`https://test.local/status?${query}`),
		});
		expect(status.status).toBe(200);
		const body = await status.json();
		const controller = new AbortController();
		const stream = await handleCodebaseSyncStream({
			params: { codebaseId: f.codebaseId },
			request: new Request(`https://test.local/sync-stream?${query}`, {
				signal: controller.signal,
			}),
		});
		expect(stream.status).toBe(200);
		const reader = stream.body?.getReader();
		if (!reader) throw new Error("Sync stream missing");
		try {
			const frame = new TextDecoder().decode((await reader.read()).value);
			const data = frame
				.split("\n")
				.find((line) => line.startsWith("data: "))
				?.slice(6);
			if (!data) throw new Error("Sync frame missing");
			expect(JSON.parse(data)).toEqual(body);
			for (const serialized of [JSON.stringify(body), frame]) {
				expect(serialized).not.toContain(accepted.syncToken);
				expect(serialized).not.toContain("credentialHash");
				expect(serialized).not.toContain("syncToken");
			}
		} finally {
			controller.abort();
			await reader.cancel();
		}
		return syncStatusResponseSchema.parse(body);
	};
	const previous = await read(f.sessionId);
	expect(
		isResyncSessionVerified({
			status: previous,
			activeSessionId: accepted.sessionId,
		}),
	).toBe(false);
	const waiting = await read(accepted.sessionId);
	expect(waiting).toMatchObject({
		sessionId: accepted.sessionId,
		status: "waiting_for_cli",
		snapshotId: null,
		workspaceSnapshotId: f.snapshotId,
		analysisId: null,
	});
	expect(waiting.analysisStatus).toBeUndefined();
	expect(
		isResyncSessionVerified({
			status: waiting,
			activeSessionId: accepted.sessionId,
		}),
	).toBe(false);
	const snapshotId = await uploadSnapshot(f.codebaseId, accepted.syncToken);
	const uploaded = await read(accepted.sessionId);
	expect(uploaded).toMatchObject({
		status: "uploaded",
		snapshotId,
		workspaceSnapshotId: f.snapshotId,
	});
	expect(
		isResyncSessionVerified({
			status: uploaded,
			activeSessionId: accepted.sessionId,
		}),
	).toBe(false);
	expect((await analyzeSnapshot(f.projectId, snapshotId)).status).toBe(200);
	const ready = await read(accepted.sessionId);
	expect(ready).toMatchObject({
		snapshotId,
		workspaceSnapshotId: snapshotId,
		analysisStatus: "ready",
	});
	expect(
		isResyncSessionVerified({
			status: ready,
			activeSessionId: accepted.sessionId,
		}),
	).toBe(true);
	const before = await f.db
		.select()
		.from(f.s.creditOperations)
		.where(eq(f.s.creditOperations.userId, f.userId));
	expect((await analyzeSnapshot(f.projectId, snapshotId)).status).toBe(200);
	await read(accepted.sessionId);
	expect(
		await f.db
			.select()
			.from(f.s.creditOperations)
			.where(eq(f.s.creditOperations.userId, f.userId)),
	).toEqual(before);
	expect(before).toHaveLength(1);
	expect(before[0]?.state).toBe("settled");
}, 30000);
