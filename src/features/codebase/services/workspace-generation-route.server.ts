import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
	workspaceGenerationOperationSchema,
	workspaceGenerationRequestSchema,
} from "../types/workspace-generation";
import {
	DurableGenerationError,
	getExistingGenerationOperation,
	getGenerationOperation,
	getOrCreateGenerationOperation,
	listGenerationOperations,
} from "./durable-generation.server";
import { resolveWorkspaceGenerationSource } from "./workspace-generation-source.server";

const querySchema = z.object({
	projectId: z.string().min(1).max(128),
	operationId: z.string().min(1).max(128).optional(),
});
const timestamp = z.union([
	z.date().transform((date) => date.toISOString()),
	z.string(),
]);
const publicOperationSchema = workspaceGenerationOperationSchema.extend({
	createdAt: timestamp,
	updatedAt: timestamp,
	startedAt: timestamp.nullable().optional(),
	finishedAt: timestamp.nullable().optional(),
});
const json = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleWorkspaceGenerationPost(
	request: Request,
): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return json({ error: "Sesi berakhir. Masuk kembali." }, 401);
	}
	const parsed = workspaceGenerationRequestSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success)
		return json({ error: "Permintaan generasi tidak valid." }, 400);
	try {
		const source = await resolveWorkspaceGenerationSource(
			user.id,
			parsed.data.projectId,
			parsed.data.stage,
		);
		if (!source) return json({ error: "Project tidak ditemukan." }, 404);
		if ("code" in source) return json(source, source.status);
		if (new URL(request.url).searchParams.get("reconcile") === "1") {
			const operation = await getExistingGenerationOperation(
				user.id,
				parsed.data,
				source,
			);
			return json({
				operation: operation ? publicOperationSchema.parse(operation) : null,
			});
		}
		const operation = await getOrCreateGenerationOperation(
			user.id,
			parsed.data,
			source,
		);
		if (!operation) return json({ error: "Project tidak ditemukan." }, 404);
		return json(
			{ operation: publicOperationSchema.parse(operation) },
			operation.status === "completed" ? 200 : 202,
		);
	} catch (error) {
		if (error instanceof DurableGenerationError)
			return json({ error: error.message, code: error.code }, error.status);
		console.error("Workspace generation acceptance failed:", error);
		return json(
			{
				error:
					"Generasi belum dapat dipastikan. Muat ulang untuk memeriksa statusnya.",
			},
			503,
		);
	}
}

export async function handleWorkspaceGenerationGet(
	request: Request,
): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return json({ error: "Sesi berakhir. Masuk kembali." }, 401);
	}
	const url = new URL(request.url);
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return json({ error: "Project wajib dipilih." }, 400);
	try {
		const { projectId, operationId } = parsed.data;
		if (operationId) {
			const operation = await getGenerationOperation(user.id, operationId);
			if (!operation || operation.projectId !== projectId)
				return json({ error: "Generasi tidak ditemukan." }, 404);
			return json({ operation: publicOperationSchema.parse(operation) });
		}
		const operations = await listGenerationOperations(user.id, projectId);
		return json({
			operations: operations.map((operation) =>
				publicOperationSchema.parse(operation),
			),
		});
	} catch (error) {
		console.error("Workspace generation status failed:", error);
		return json(
			{ error: "Status generasi belum dapat dibaca. Menghubungkan kembali..." },
			503,
		);
	}
}
