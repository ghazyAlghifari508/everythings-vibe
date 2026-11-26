import { createHash } from "node:crypto";
import { expect } from "vitest";

export async function uploadSnapshot(codebaseId: string, syncToken: string) {
	const { handleCodebaseSyncHandshake } = await import(
		"../services/sync-handshake-route.server"
	);
	const { handleManifestBatchUpload } = await import(
		"../services/sync-upload-manifest-route.server"
	);
	const { handleFileChunkUpload } = await import(
		"../services/sync-upload-files-route.server"
	);
	const { handleSnapshotCompleteUpload } = await import(
		"../services/sync-upload-complete-route.server"
	);
	const params = { id: codebaseId };
	const options = { recordLifecycleEvents: true };
	const request = (body: object) =>
		new Request("https://test.local/sync", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${syncToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
	const connected = await handleCodebaseSyncHandshake({
		params,
		request: request({ cliVersion: "3.2.1" }),
	});
	expect(connected.status).toBe(200);
	const binding = await connected.json();
	const identity = {
		sessionId: binding.sessionId,
		attemptId: binding.attemptId,
	};
	const source = "export const version = 2;\n";
	const hash = createHash("sha256").update(source).digest("hex");
	const manifest = await handleManifestBatchUpload(
		request({
			...identity,
			batchIndex: 0,
			batchTotal: 1,
			idempotencyKey: `${binding.attemptId}:manifest:0`,
			entries: [
				{
					path: "src/version.ts",
					size: Buffer.byteLength(source),
					hash,
					language: "typescript",
				},
			],
		}),
		params,
		options,
	);
	expect(manifest.status).toBe(200);
	const file = await handleFileChunkUpload(
		request({
			...identity,
			path: "src/version.ts",
			chunkIndex: 0,
			chunkTotal: 1,
			encoding: "base64",
			data: Buffer.from(source).toString("base64"),
			contentHash: hash,
			idempotencyKey: `${binding.attemptId}:file:0`,
		}),
		params,
		options,
	);
	expect(file.status).toBe(200);
	const completed = await handleSnapshotCompleteUpload(
		request({
			...identity,
			fileCount: 1,
			excludedCount: 0,
			idempotencyKey: `${binding.attemptId}:complete:0`,
		}),
		params,
		options,
	);
	expect(completed.status).toBe(200);
	const result = await completed.json();
	if (typeof result.snapshotId !== "string")
		throw new Error("Verified snapshot missing");
	return result.snapshotId;
}

export async function analyzeSnapshot(projectId: string, snapshotId: string) {
	const { triggerCodebaseAnalysis } = await import(
		"../services/analysis-route-trigger.server"
	);
	return triggerCodebaseAnalysis(
		new Request("https://test.local/analysis", {
			method: "POST",
			body: JSON.stringify({ snapshotId }),
		}),
		projectId,
	);
}

export function generatedAnalysis() {
	return JSON.stringify({
		framework: "React",
		language: "TypeScript",
		starterSuggestions: ["feature", "bugfix", "refactor", "ui"].map((id) => ({
			id,
			title: `Inspect ${id}`,
			description: "Inspect repository behavior",
			prompt: "Inspect repository evidence before changing behavior.",
			relevantPaths: [],
		})),
	});
}
