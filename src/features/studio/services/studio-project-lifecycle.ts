import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
	type InsertStudioFrameRow,
	type InsertStudioProjectRow,
	type InsertStudioRevisionRow,
	type StudioProjectRow,
	studioAssets,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { buildStudioAssetUrl } from "./studio-logo-service";

export async function listStudioProjects(
	userId: string,
	limit = 50,
): Promise<StudioProjectRow[]> {
	return db
		.select()
		.from(studioProjects)
		.where(eq(studioProjects.userId, userId))
		.orderBy(desc(studioProjects.updatedAt))
		.limit(limit);
}

export async function deleteStudioProject(
	projectId: string,
	userId: string,
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		// The same project lock prevents workers from resurrecting deleted rows.
		const [project] = await tx
			.select({
				id: studioProjects.id,
				logoAssetId: studioProjects.logoAssetId,
			})
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");

		// Assets have no project FK, so cascade deletion alone leaves orphans.
		await tx
			.delete(studioAssets)
			.where(
				and(
					eq(studioAssets.userId, userId),
					project.logoAssetId
						? or(
								eq(studioAssets.projectId, projectId),
								eq(studioAssets.id, project.logoAssetId),
							)
						: eq(studioAssets.projectId, projectId),
				),
			);
		await tx
			.delete(studioRevisions)
			.where(eq(studioRevisions.projectId, projectId));
		await tx.delete(studioFrames).where(eq(studioFrames.projectId, projectId));
		await tx.delete(studioJobs).where(eq(studioJobs.projectId, projectId));
		const deleted = await tx
			.delete(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.returning({ id: studioProjects.id });
		if (deleted.length === 0)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		return { id: deleted[0].id };
	});
}

export async function duplicateStudioProject(
	projectId: string,
	userId: string,
): Promise<StudioProjectRow> {
	return db.transaction(async (tx) => {
		const [source] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.limit(1);
		if (!source)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const assets = await tx
			.select()
			.from(studioAssets)
			.where(
				and(
					eq(studioAssets.projectId, projectId),
					eq(studioAssets.userId, userId),
				),
			);
		const [copy] = await tx
			.insert(studioProjects)
			.values({
				userId,
				title: `${source.title.slice(0, 190)} (Salinan)`,
				designMode: source.designMode,
				designMd: source.designMd,
				designSkillId: source.designSkillId,
				initialPageCount: source.initialPageCount,
				designReference: source.designReference,
				prdContent: source.prdContent,
				prdFilename: source.prdFilename,
				prdContentHash: source.prdContentHash,
			} satisfies InsertStudioProjectRow)
			.returning();
		if (!copy) throw new ScrapeError("STORAGE_FAILED");
		const replacements = new Map<string, string>();
		for (const asset of assets) {
			const [newAsset] = await tx
				.insert(studioAssets)
				.values({
					userId,
					projectId: copy.id,
					filename: asset.filename,
					mimeType: asset.mimeType,
					byteLength: asset.byteLength,
					data: asset.data,
				} satisfies InsertStudioAssetRow)
				.returning();
			if (!newAsset) throw new ScrapeError("STORAGE_FAILED");
			replacements.set(asset.id, buildStudioAssetUrl(newAsset.id, userId));
			if (source.logoAssetId === asset.id) {
				await tx
					.update(studioProjects)
					.set({ logoAssetId: newAsset.id })
					.where(
						and(
							eq(studioProjects.id, copy.id),
							eq(studioProjects.userId, userId),
						),
					);
				copy.logoAssetId = newAsset.id;
			}
		}
		if (source.logoAssetId && !copy.logoAssetId)
			throw new ScrapeError(
				"STORAGE_FAILED",
				"Aset logo sumber tidak tersedia.",
			);
		const rewriteHtml = (html: string) =>
			html.replace(/\/api\/studio\/asset\?[^"'\s<>]+/g, (url) => {
				const assetId = new URL(
					url.replaceAll("&amp;", "&"),
					"https://studio.invalid",
				).searchParams.get("id");
				return assetId ? (replacements.get(assetId) ?? url) : url;
			});
		const revisions = await tx
			.select()
			.from(studioRevisions)
			.where(eq(studioRevisions.projectId, source.id));
		for (const revision of revisions) {
			await tx.insert(studioRevisions).values({
				projectId: copy.id,
				prompt: revision.prompt,
				htmlCode: rewriteHtml(revision.htmlCode),
				version: revision.version,
			} satisfies InsertStudioRevisionRow);
		}
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, source.id));
		for (const frame of frames) {
			await tx.insert(studioFrames).values({
				projectId: copy.id,
				name: frame.name,
				description: frame.description,
				viewport: frame.viewport,
				order: frame.order,
				htmlCode: frame.htmlCode ? rewriteHtml(frame.htmlCode) : null,
				status: frame.htmlCode ? "ready" : "failed",
				error: frame.htmlCode
					? null
					: (frame.error ??
						"Layar sumber belum selesai. Coba lagi untuk membuat layar ini."),
			} satisfies InsertStudioFrameRow);
		}
		return copy;
	});
}
