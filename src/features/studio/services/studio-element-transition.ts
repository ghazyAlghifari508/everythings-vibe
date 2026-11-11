import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
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
			(action === "undo" && row.status !== "applied") ||
			!row.afterHtml
		)
			throw new StudioFrameError("STUDIO_STALE_REVISION");
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
						baseHash: studioElementHash(row.afterHtml),
					};
		assertStudioElementBase(frame, expected);
		const revision = frame.revision + 1;
		const htmlCode = action === "apply" ? row.afterHtml : row.beforeHtml;
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
			.innerJoin(
				studioProjects,
				eq(studioProjects.id, studioRevisions.projectId),
			)
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
			.where(scope)
			.returning();
		await writeStudioElementMessage(tx, updated);
		return studioElementPreview(updated);
	});
}
