import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	type StudioElementRevisionRow,
	studioElementRevisions,
	studioFrames,
	studioJobs,
	studioMessages,
	studioProjects,
} from "@/db/schema";
import type {
	StudioElementPreview,
	StudioElementTarget,
} from "../types/studio-element";
import { studioElementHash } from "./studio-element-document";
import { StudioFrameError } from "./studio-frame-errors";
import type { StudioJobTransaction } from "./studio-job-lease";

export async function lockStudioElementProject(
	tx: StudioJobTransaction,
	projectId: string,
	userId: string,
) {
	const [project] = await tx
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.for("update");
	if (!project) throw new StudioFrameError("STUDIO_NOT_FOUND");
	return project;
}
export async function readOwnedStudioElementFrame(
	tx: StudioJobTransaction | typeof db,
	projectId: string,
	frameId: string,
	userId: string,
) {
	const [row] = await tx
		.select({ frame: studioFrames, project: studioProjects })
		.from(studioFrames)
		.innerJoin(studioProjects, eq(studioFrames.projectId, studioProjects.id))
		.where(
			and(
				eq(studioFrames.projectId, projectId),
				eq(studioFrames.id, frameId),
				eq(studioProjects.userId, userId),
			),
		);
	if (!row?.frame.htmlCode) throw new StudioFrameError("STUDIO_NOT_FOUND");
	return row;
}
export function assertStudioElementBase(
	frame: { revision: number; htmlCode: string | null },
	target: Pick<StudioElementTarget, "baseRevision" | "baseHash">,
) {
	if (
		frame.revision !== target.baseRevision ||
		studioElementHash(frame.htmlCode ?? "") !== target.baseHash
	)
		throw new StudioFrameError("STUDIO_STALE_REVISION");
}
export async function assertStudioElementIdle(
	tx: StudioJobTransaction,
	projectId: string,
	userId: string,
	frameId: string,
) {
	const [job] = await tx
		.select({ id: studioJobs.id })
		.from(studioJobs)
		.where(
			and(
				eq(studioJobs.projectId, projectId),
				eq(studioJobs.userId, userId),
				eq(studioJobs.targetFrameId, frameId),
				inArray(studioJobs.status, ["queued", "planning", "generating"]),
			),
		);
	if (job) throw new StudioFrameError("STUDIO_RETRY_RUNNING");
}
export function studioElementPreview(
	row: StudioElementRevisionRow,
): StudioElementPreview {
	return {
		id: row.id,
		frameId: row.frameId,
		frameName: row.frameName,
		baseRevision: row.baseRevision,
		baseHash: row.baseHash,
		target: row.target,
		status: row.status,
		before: row.beforeHtml,
		after: row.afterHtml,
		summary: row.summary,
		appliedRevision: row.appliedRevision,
	};
}
export async function writeStudioElementMessage(
	tx: StudioJobTransaction,
	row: StudioElementRevisionRow,
	initial = false,
) {
	const scope = and(
		eq(studioMessages.projectId, row.projectId),
		eq(studioMessages.userId, row.userId),
		eq(studioMessages.operationId, row.id),
	);
	const content =
		row.status === "preview"
			? `Pratinjau siap: ${row.summary} Belum diterapkan.`
			: row.status === "applied"
				? `Revisi diterapkan pada ${row.frameName} / ${row.target.label}.`
				: row.status === "cancelled"
					? "Pratinjau dibatalkan. Desain asli tidak berubah."
					: row.status === "undone"
						? "Revisi dibatalkan melalui Undo. Versi sebelumnya dipulihkan."
						: row.status === "rejected"
							? "Revisi ditolak. Pilih elemen terbaru lalu kirim ulang."
							: "Menyiapkan pratinjau perubahan pada elemen terpilih.";
	const status =
		row.status === "generating"
			? "generating"
			: row.status === "rejected"
				? "failed"
				: "completed";
	if (!initial) {
		await tx
			.update(studioMessages)
			.set({ content, status, updatedAt: new Date() })
			.where(and(scope, eq(studioMessages.role, "assistant")));
		return;
	}
	const [tail] = await tx
		.select({ order: studioMessages.order })
		.from(studioMessages)
		.where(
			and(
				eq(studioMessages.projectId, row.projectId),
				eq(studioMessages.userId, row.userId),
			),
		)
		.orderBy(desc(studioMessages.order))
		.limit(1);
	const order = (tail?.order ?? -1) + 1;
	const common = {
		projectId: row.projectId,
		userId: row.userId,
		operationId: row.id,
		jobIds: [],
		attachments: [
			{
				frameId: row.frameId,
				name: `${row.frameName} / ${row.target.label}`,
				target: row.target,
			},
		],
	};
	await tx.insert(studioMessages).values([
		{ ...common, order, role: "user", content: row.prompt, status: "accepted" },
		{ ...common, order: order + 1, role: "assistant", content, status },
	]);
}
export async function readStudioElementRows(projectId: string, userId: string) {
	const [owned] = await db
		.select({ id: studioProjects.id })
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		);
	if (!owned) throw new StudioFrameError("STUDIO_NOT_FOUND");
	return db
		.select()
		.from(studioElementRevisions)
		.where(
			and(
				eq(studioElementRevisions.projectId, projectId),
				eq(studioElementRevisions.userId, userId),
			),
		)
		.orderBy(asc(studioElementRevisions.createdAt));
}
