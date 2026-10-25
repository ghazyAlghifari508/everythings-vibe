import { setTimeout } from "node:timers/promises";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { createSseEmitter, sseResponse } from "@/lib/sse-stream";
import { workspaceGenerationOperationSchema } from "../types/workspace-generation";
import type { CodebaseRunStage } from "./chat-flow-run";
import { getGenerationOperation } from "./durable-generation.server";
import { handleWorkspaceGenerationPost } from "./workspace-generation-route.server";

const legacyBodySchema = z
	.object({
		projectId: z.string().min(1),
		action: z.string().optional(),
		mode: z.string().optional(),
	})
	.passthrough();
const OBSERVER_POLL_MS = 1000;

export async function handleLegacyWorkspaceGeneration(
	request: Request,
	stage: CodebaseRunStage,
	legacy: (request: Request) => Promise<Response>,
): Promise<Response> {
	const parsed = legacyBodySchema.safeParse(
		await request
			.clone()
			.json()
			.catch(() => null),
	);
	if (
		!parsed.success ||
		(stage === "questions" && parsed.data.action) ||
		(stage === "prd" && parsed.data.mode !== "generate")
	)
		return legacy(request);
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return legacy(request);
	}
	const { projectId } = parsed.data;
	const [project] = await db
		.select({ projectMode: projects.projectMode })
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, user.id),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (project?.projectMode !== "existing_codebase") return legacy(request);
	const input =
		stage === "questions"
			? {
					prompt: parsed.data.prompt,
					platform: parsed.data.platform,
					language: parsed.data.language,
				}
			: stage === "prd"
				? { message: parsed.data.message, mode: "generate" }
				: {};
	const accepted = await handleWorkspaceGenerationPost(
		new Request(new URL("/api/codebase/generation", request.url), {
			method: "POST",
			headers: request.headers,
			body: JSON.stringify({ projectId, stage, input }),
		}),
	);
	if (!accepted.ok) return accepted;
	const envelope = z
		.object({ operation: workspaceGenerationOperationSchema })
		.safeParse(await accepted.json());
	if (!envelope.success)
		return Response.json(
			{ error: "Status generasi tidak valid." },
			{ status: 503 },
		);
	const initial = envelope.data.operation;
	const observer = new AbortController();
	const observerSignal = AbortSignal.any([request.signal, observer.signal]);
	const observe = async (onStatus?: (status: string) => void) => {
		let operation = initial;
		while (operation.status === "queued" || operation.status === "running") {
			await setTimeout(OBSERVER_POLL_MS, undefined, { signal: observerSignal });
			const current = await getGenerationOperation(user.id, operation.id);
			if (!current) throw new Error("Generasi tidak ditemukan.");
			operation = current;
			onStatus?.(operation.status);
		}
		return operation;
	};
	if (stage === "questions" || stage === "feature") {
		try {
			const operation = await observe();
			return operation.status === "completed" &&
				operation.artifactId &&
				operation.result
				? Response.json(operation.result)
				: Response.json(
						{ error: operation.error ?? "Generasi gagal." },
						{ status: 409 },
					);
		} catch {
			return Response.json(
				{ error: "Pemantauan terputus. Muat ulang untuk memeriksa progres." },
				{ status: 503 },
			);
		}
	}
	return sseResponse(
		new ReadableStream<Uint8Array>({
			async start(controller) {
				const sse = createSseEmitter(controller);
				sse.send({ type: "started", operationId: initial.id });
				try {
					const operation = await observe((status) =>
						sse.send({ type: "status", status, operationId: initial.id }),
					);
					sse.send(
						operation.status === "completed" && operation.artifactId
							? { type: "done", operationId: operation.id }
							: { type: "error", error: operation.error ?? "Generasi gagal." },
					);
				} catch {
					sse.send({
						type: "error",
						error: "Pemantauan terputus. Muat ulang untuk memeriksa progres.",
					});
				} finally {
					sse.close();
				}
			},
			cancel() {
				observer.abort();
			},
		}),
	);
}
