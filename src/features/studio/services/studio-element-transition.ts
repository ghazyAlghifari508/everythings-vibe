import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioElementRevisionRow,
	studioElementRevisions,
	studioFrames,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { studioElementHash } from "./studio-element-document";
import {
	assertStudioElementBase,
	assertStudioElementIdle,
	lockStudioElementProject,
	readOwnedStudioElementFrame,
	studioElementPreview,
	writeStudioElementMessage,
} from "./studio-element-storage";
import { StudioFrameError } from "./studio-frame-errors";
import type { StudioJobTransaction } from "./studio-job-lease";

/**
 * Atomically publishes one already-validated patch. The frame write is guarded
 * by both its revision and its HTML, so a candidate built on an older base can
 * never overwrite a newer user edit. The same path serves auto apply, explicit
 * recovery of legacy candidates, and Undo.
 */
export async function applyStudioElementRevision(
	tx: StudioJobTransaction,
	row: StudioElementRevisionRow,
	projectId: string,
	userId: string,
	action: "apply" | "undo",
	initialMessage = false,
) {
	const { frame } = await readOwnedStudioElementFrame(
		tx,
		projectId,
		row.frameId,
		userId,
	);
	await assertStudioElementIdle(tx, projectId, userId, row.frameId);
	const expected =
		action === "apply"
			? { baseRevision: row.baseRevision, baseHash: row.baseHash }
			: {
					baseRevision: row.appliedRevision ?? -1,
					baseHash: studioElementHash(row.afterHtml ?? ""),
				};
	assertStudioElementBase(frame, expected);
	const htmlCode = action === "apply" ? row.afterHtml : row.beforeHtml;
	if (!htmlCode) throw new StudioFrameError("STUDIO_STALE_REVISION");
	const revision = frame.revision + 1;
	const [saved] = await tx
		.update(studioFrames)
		.set({
			htmlCode,
			revision,
			visualHash: null,
			status: "ready",
			error: null,
			updatedAt: new Date(),
		})
		.from(studioProjects)
		.where(
			and(
				eq(studioFrames.id, row.frameId),
				eq(studioFrames.projectId, projectId),
				eq(studioProjects.id, studioFrames.projectId),
				eq(studioProjects.userId, userId),
				eq(studioFrames.revision, frame.revision),
				eq(studioFrames.htmlCode, frame.htmlCode ?? ""),
			),
		)
		.returning({ id: studioFrames.id });
	if (!saved) throw new StudioFrameError("STUDIO_STALE_REVISION");
	const [latest] = await tx
		.select({ version: studioRevisions.version })
		.from(studioRevisions)
		.innerJoin(studioProjects, eq(studioProjects.id, studioRevisions.projectId))
		.where(
			and(
				eq(studioRevisions.projectId, projectId),
				eq(studioProjects.userId, userId),
			),
		)
		.orderBy(desc(studioRevisions.version))
		.limit(1);
	await tx.insert(studioRevisions).values({
		projectId,
		frameId: row.frameId,
		frameRevision: revision,
		htmlCode,
		prompt: action === "undo" ? `Undo: ${row.prompt}` : row.prompt,
		version: (latest?.version ?? 0) + 1,
	});
	const [updated] = await tx
		.update(studioElementRevisions)
		.set(
			action === "apply"
				? {
						status: "applied",
						appliedRevision: revision,
						updatedAt: new Date(),
					}
				: { status: "undone", undoRevision: revision, updatedAt: new Date() },
		)
		.where(
			and(
				eq(studioElementRevisions.id, row.id),
				eq(studioElementRevisions.projectId, projectId),
				eq(studioElementRevisions.userId, userId),
			),
		)
		.returning();
	await writeStudioElementMessage(tx, updated, initialMessage);
	return updated;
}

export async function transitionStudioElementRevision(
	userId: string,
	projectId: string,
	revisionId: string,
	action: "apply" | "cancel" | "undo",
) {
	return db.transaction(async (tx) => {
		await lockStudioElementProject(tx, projectId, userId);
		const scope = and(
			eq(studioElementRevisions.id, revisionId),
			eq(studioElementRevisions.projectId, projectId),
			eq(studioElementRevisions.userId, userId),
		);
		const [row] = await tx
			.select()
			.from(studioElementRevisions)
			.where(scope)
			.for("update");
		if (!row) throw new StudioFrameError("STUDIO_NOT_FOUND");
		if (action === "cancel") {
			if (row.status === "cancelled") return studioElementPreview(row);
			if (!["generating", "preview", "rejected"].includes(row.status))
				throw new StudioFrameError("STUDIO_STALE_REVISION");
			const [cancelled] = await tx
				.update(studioElementRevisions)
				.set({ status: "cancelled", updatedAt: new Date() })
				.where(scope)
				.returning();
			await writeStudioElementMessage(tx, cancelled);
			return studioElementPreview(cancelled);
		}
		if (
			(action === "apply" && row.status === "applied") ||
			(action === "undo" && row.status === "undone")
		)
			return studioElementPreview(row);
		if (row.status === "cancelled")
			throw new StudioFrameError("STUDIO_CANCELLED");
		if (
			(action === "apply" && row.status !== "preview") ||
			(action === "undo" && row.status !== "applied")
		)
			throw new StudioFrameError("STUDIO_STALE_REVISION");
		// Only candidates from the old explicit-apply workflow can reach here.
		// Auto-applied edits already have status "applied" and are never
		// published again, so historical candidates stay unapplied until the
		// user explicitly chooses to publish them.
		return studioElementPreview(
			await applyStudioElementRevision(tx, row, projectId, userId, action),
		);
	});
}
