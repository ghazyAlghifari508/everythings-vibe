import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studioElementRevisions } from "@/db/schema";
import {
	STUDIO_ELEMENT_TIMEOUT_MS,
	type StudioElementRequest,
	studioElementRequestSchema,
} from "../types/studio-element";
import {
	resolveStudioElement,
	studioElementHash,
} from "./studio-element-document";
import { generateStudioElementEdit } from "./studio-element-generation";
import { patchStudioElement } from "./studio-element-patch";
import {
	assertStudioElementBase,
	assertStudioElementIdle,
	lockStudioElementProject,
	readOwnedStudioElementFrame,
	readStudioElementRows,
	studioElementPreview,
	writeStudioElementMessage,
} from "./studio-element-storage";
import { StudioFrameError } from "./studio-frame-errors";

export { transitionStudioElementRevision } from "./studio-element-transition";
export async function readStudioElementRevisions(
	projectId: string,
	userId: string,
) {
	return (await readStudioElementRows(projectId, userId)).map(
		studioElementPreview,
	);
}
export async function prepareStudioElementRevision(
	userId: string,
	raw: StudioElementRequest,
	signal?: AbortSignal,
) {
	const input = studioElementRequestSchema.parse(raw);
	const { target } = input;
	const requestHash = studioElementHash(
		JSON.stringify({ prompt: input.prompt, target, edit: input.edit }),
	);
	const accepted = await db.transaction(async (tx) => {
		const project = await lockStudioElementProject(
			tx,
			target.projectId,
			userId,
		);
		const [existing] = await tx
			.select()
			.from(studioElementRevisions)
			.where(
				and(
					eq(studioElementRevisions.projectId, target.projectId),
					eq(studioElementRevisions.userId, userId),
					eq(studioElementRevisions.requestId, input.requestId),
				),
			);
		if (existing) {
			if (existing.requestHash !== requestHash)
				throw new StudioFrameError("STUDIO_IDEMPOTENCY_CONFLICT");
			return { row: existing, project, fresh: false };
		}
		const { frame } = await readOwnedStudioElementFrame(
			tx,
			target.projectId,
			target.frameId,
			userId,
		);
		assertStudioElementBase(frame, target);
		await assertStudioElementIdle(tx, target.projectId, userId, target.frameId);
		const resolved = resolveStudioElement(
			frame.htmlCode ?? "",
			{
				projectId: frame.projectId,
				frameId: frame.id,
				baseRevision: frame.revision,
			},
			target,
		);
		resolved.dom.window.close();
		const [row] = await tx
			.insert(studioElementRevisions)
			.values({
				projectId: target.projectId,
				userId,
				frameId: target.frameId,
				frameName: frame.name,
				requestId: input.requestId,
				requestHash,
				baseRevision: target.baseRevision,
				baseHash: target.baseHash,
				target,
				prompt: input.prompt,
				status: "generating",
				beforeHtml: frame.htmlCode ?? "",
			})
			.returning();
		await writeStudioElementMessage(tx, row, true);
		return { row, project, fresh: true };
	});
	const scope = and(
		eq(studioElementRevisions.id, accepted.row.id),
		eq(studioElementRevisions.projectId, target.projectId),
		eq(studioElementRevisions.userId, userId),
	);
	if (!accepted.fresh) {
		if (accepted.row.status === "rejected")
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		if (
			accepted.row.status === "generating" &&
			Date.now() - accepted.row.updatedAt.getTime() > STUDIO_ELEMENT_TIMEOUT_MS
		) {
			await db.transaction(async (tx) => {
				await lockStudioElementProject(tx, target.projectId, userId);
				const [row] = await tx
					.update(studioElementRevisions)
					.set({
						status: "rejected",
						errorCode: "STUDIO_PROVIDER_TIMEOUT",
						updatedAt: new Date(),
					})
					.where(and(scope, eq(studioElementRevisions.status, "generating")))
					.returning();
				if (row) await writeStudioElementMessage(tx, row);
			});
			throw new StudioFrameError("STUDIO_PROVIDER_TIMEOUT");
		}
		return studioElementPreview(accepted.row);
	}
	try {
		const edit = await generateStudioElementEdit(
			input,
			accepted.row.beforeHtml,
			accepted.project.designMd,
			signal,
		);
		const afterHtml = patchStudioElement(
			accepted.row.beforeHtml,
			target,
			target,
			edit,
		);
		const summary = `${edit.kind === "remove" ? "Hapus" : "Ubah"} ${target.label || target.tag}. Bagian lain dipertahankan.`;
		return await db.transaction(async (tx) => {
			await lockStudioElementProject(tx, target.projectId, userId);
			const { frame } = await readOwnedStudioElementFrame(
				tx,
				target.projectId,
				target.frameId,
				userId,
			);
			assertStudioElementBase(frame, target);
			const [row] = await tx
				.update(studioElementRevisions)
				.set({
					afterHtml,
					edit,
					summary,
					status: "preview",
					updatedAt: new Date(),
				})
				.where(and(scope, eq(studioElementRevisions.status, "generating")))
				.returning();
			if (!row) throw new StudioFrameError("STUDIO_CANCELLED");
			await writeStudioElementMessage(tx, row);
			return studioElementPreview(row);
		});
	} catch (error) {
		await db.transaction(async (tx) => {
			await lockStudioElementProject(tx, target.projectId, userId);
			const [row] = await tx
				.update(studioElementRevisions)
				.set({
					status: "rejected",
					errorCode:
						error instanceof StudioFrameError
							? error.code
							: "STUDIO_FRAME_FAILED",
					updatedAt: new Date(),
				})
				.where(and(scope, eq(studioElementRevisions.status, "generating")))
				.returning();
			if (row) await writeStudioElementMessage(tx, row);
		});
		throw error;
	}
}
