import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import {
	createSyncClient,
	planFileChunks,
} from "../../../../packages/cli/src/lib/sync-client";
import "./analysis-credit-db-fixture";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: auth.userId }),
}));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock("../services/analysis-server-generate", () => ({
	defaultGenerate: async () =>
		JSON.stringify({
			framework: "React",
			language: "TypeScript",
			starterSuggestions: ["feature", "bugfix", "refactor", "ui"].map((id) => ({
				id,
				title: `Inspect ${id}`,
				description: "Inspect repository behavior",
				prompt: "Inspect repository evidence before changing behavior.",
				relevantPaths: [],
			})),
		}),
}));

test("official CLI uploads a real resync over HTTP; analysis and duplicate triggers settle once", async () => {
	const { db } = await import("@/db");
	const s = await import("@/db/schema");
	const { handleCodebaseCreate } = await import(
		"../services/library-route.server"
	);
	const { handleCodebaseSessionCreate } = await import(
		"../services/sync-session-route.server"
	);
	const { handleCodebaseSyncConnect } = await import(
		"../services/sync-connect-route.server"
	);
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
	const { triggerCodebaseAnalysis } = await import(
		"../services/analysis-route-trigger.server"
	);
	const { readWorkspaceSnapshot } = await import(
		"../services/workspace-snapshot.server"
	);
	auth.userId = crypto.randomUUID();
	await db.insert(s.users).values({
		id: auth.userId,
		email: `${auth.userId}@test.local`,
		name: "CLI resync",
		initialAnalysisUsedAt: new Date(),
	});
	await db.insert(s.subscriptions).values({
		id: crypto.randomUUID(),
		userId: auth.userId,
		plan: "pro",
		credits: 100,
	});
	const initialResponse = await handleCodebaseCreate({
		request: new Request("https://test.local/api/codebases", {
			method: "POST",
			body: JSON.stringify({ requestId: crypto.randomUUID() }),
		}),
	});
	expect(initialResponse.status).toBe(200);
	const initial = await initialResponse.json();
	const projectId = crypto.randomUUID();
	await db.insert(s.projects).values({
		id: projectId,
		userId: auth.userId,
		codebaseId: initial.id,
		name: "Repository analysis",
		projectMode: "existing_codebase",
	});
	await db
		.update(s.codebases)
		.set({ onboardingProjectId: projectId })
		.where(eq(s.codebases.id, initial.id));
	const server = createServer(async (incoming, outgoing) => {
		try {
			const chunks: Buffer[] = [];
			for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
			const request = new Request(`http://127.0.0.1${incoming.url}`, {
				method: "POST",
				headers: {
					Authorization: incoming.headers.authorization ?? "",
					"Content-Type": "application/json",
				},
				body: Buffer.concat(chunks).toString(),
			});
			const params = { id: initial.id };
			const suffix = incoming.url?.split("/").at(-1);
			const response =
				suffix === "connect"
					? await handleCodebaseSyncConnect({ request, params })
					: suffix === "sync"
						? await handleCodebaseSyncHandshake({ request, params })
						: suffix === "manifest"
							? await handleManifestBatchUpload(request, params, {
									recordLifecycleEvents: true,
								})
							: suffix === "files"
								? await handleFileChunkUpload(request, params, {
										recordLifecycleEvents: true,
									})
								: await handleSnapshotCompleteUpload(request, params, {
										recordLifecycleEvents: true,
									});
			outgoing.writeHead(response.status, {
				"Content-Type": "application/json",
			});
			outgoing.end(await response.text());
		} catch (error) {
			outgoing.statusCode = 500;
			outgoing.end(
				JSON.stringify({
					error: error instanceof Error ? error.message : "Unknown error",
				}),
			);
		}
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing HTTP address");
	const apiUrl = `http://127.0.0.1:${address.port}`;
	const upload = async (token: string) => {
		const client = createSyncClient({
			apiUrl,
			syncToken: token,
			timeoutMs: 10000,
		});
		await client.announceConnect(initial.id);
		const session = await client.handshakeWithRetry(initial.id, "Repository");
		const source = "export const version = 2;\n";
		const hash = createHash("sha256").update(source).digest("hex");
		await client.uploadManifestWithRetry(initial.id, session, [
			{
				path: "src/version.ts",
				size: Buffer.byteLength(source),
				hash,
				language: "typescript",
			},
		]);
		await client.uploadFileChunksWithRetry(
			initial.id,
			session,
			planFileChunks([
				{
					path: "src/version.ts",
					base64: Buffer.from(source).toString("base64"),
					hash,
				},
			]),
		);
		const result = await client.completeWithRetry(initial.id, {
			...session,
			fileCount: 1,
			excludedCount: 0,
		});
		expect(
			await client.completeWithRetry(initial.id, {
				...session,
				fileCount: 1,
				excludedCount: 0,
			}),
		).toEqual(result);
		return result.snapshotId;
	};
	const analyze = (snapshotId: string) =>
		triggerCodebaseAnalysis(
			new Request("https://test.local/analysis", {
				method: "POST",
				body: JSON.stringify({ snapshotId }),
			}),
			projectId,
		);
	try {
		const firstSnapshot = await upload(initial.sync.syncToken);
		if (!firstSnapshot) throw new Error("Initial snapshot missing");
		expect((await analyze(firstSnapshot)).status).toBe(200);
		const response = await handleCodebaseSessionCreate({
			params: { codebaseId: initial.id },
			request: new Request("https://test.local/session", {
				method: "POST",
				body: JSON.stringify({
					action: "resync",
					requestId: crypto.randomUUID(),
				}),
			}),
		});
		expect(response.status).toBe(200);
		const next = await response.json();
		const nextSnapshot = await upload(next.syncToken);
		if (!nextSnapshot) throw new Error("Resync snapshot missing");
		expect(nextSnapshot).not.toBe(firstSnapshot);
		expect((await readWorkspaceSnapshot(auth.userId, initial.id))?.id).toBe(
			firstSnapshot,
		);
		expect((await analyze(nextSnapshot)).status).toBe(200);
		const before = await db
			.select()
			.from(s.subscriptions)
			.where(eq(s.subscriptions.userId, auth.userId));
		expect((await analyze(nextSnapshot)).status).toBe(200);
		expect(
			await db
				.select()
				.from(s.subscriptions)
				.where(eq(s.subscriptions.userId, auth.userId)),
		).toEqual(before);
		expect((await readWorkspaceSnapshot(auth.userId, initial.id))?.id).toBe(
			nextSnapshot,
		);
		expect(
			await db
				.select()
				.from(s.codebaseAnalyses)
				.where(eq(s.codebaseAnalyses.projectId, projectId)),
		).toHaveLength(2);
		const operations = await db
			.select()
			.from(s.creditOperations)
			.where(eq(s.creditOperations.userId, auth.userId));
		expect(operations).toHaveLength(2);
		expect(operations.map((op) => op.state)).toEqual(["settled", "settled"]);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
}, 30000);
