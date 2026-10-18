import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
	studioAssets,
	studioFrames,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { buildStudioAssetUrl } from "./studio-logo-service";
import { getStudioProjectDetail } from "./studio-project-detail";

export async function getStudioFrameVisual(
	projectId: string,
	frameId: string,
	userId: string,
	options: { forceRecapture?: boolean } = {},
) {
	const detail = await getStudioProjectDetail(projectId, userId);
	const frame = detail.frames.find((entry) => entry.id === frameId);
	if (!frame?.htmlCode)
		throw new ScrapeError("WEBSITE_BLOCKED", "Output frame belum tersedia.");
	const { captureStudioVisual, studioVisualHash } = await import(
		"./studio-visual"
	);
	const hash = studioVisualHash(frame.htmlCode, frame.viewport);
	if (frame.visualHash !== hash) {
		await db
			.update(studioFrames)
			.set({ visualHash: hash, updatedAt: new Date() })
			.where(
				and(
					eq(studioFrames.id, frame.id),
					eq(studioFrames.projectId, projectId),
				),
			);
	}
	const assets = await db
		.select()
		.from(studioAssets)
		.where(
			and(
				eq(studioAssets.projectId, projectId),
				eq(studioAssets.userId, userId),
			),
		);
	// A forced retry replaces broken cached renders; the newest capture wins.
	const cached = options.forceRecapture
		? undefined
		: assets
				.filter((asset) => asset.filename.startsWith(`visual-${hash}-`))
				.sort(
					(left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
				)[0];
	if (cached) {
		const bounds = /-(\d+)x(\d+)\.jpg$/.exec(cached.filename);
		if (bounds)
			return {
				url: buildStudioAssetUrl(cached.id, userId),
				width: Number(bounds[1]),
				height: Number(bounds[2]),
				hash,
			};
	}
	const visual = await captureStudioVisual(
		frame.htmlCode,
		frame.viewport,
		detail.project.designMd,
		assets,
	).catch((failure: unknown) => {
		// Capture failure must not imply that the persisted frame HTML was lost.
		throw new ScrapeError(
			"VISUAL_CAPTURE_FAILED",
			failure instanceof Error
				? `Pratinjau visual frame gagal dirender: ${failure.message}`
				: undefined,
			{ cause: failure },
		);
	});
	const [asset] = await db
		.insert(studioAssets)
		.values({
			userId,
			projectId,
			filename: `visual-${hash}-${visual.width}x${visual.height}.jpg`,
			mimeType: "image/jpeg",
			byteLength: visual.data.byteLength,
			data: visual.data.toString("base64"),
		} satisfies InsertStudioAssetRow)
		.returning();
	if (!asset)
		throw new ScrapeError("STORAGE_FAILED", "Gagal menyimpan visual frame.");
	return {
		url: buildStudioAssetUrl(asset.id, userId),
		width: visual.width,
		height: visual.height,
		hash,
	};
}
