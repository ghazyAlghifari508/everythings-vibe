import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/db";
import {
	studioAssets,
	studioFrames,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { buildStudioAssetUrl } from "../services/studio-logo-service";
import { duplicateStudioProject } from "../services/studio-project-lifecycle";

it("duplicates real persisted records and logo independently without allowing another owner", async () => {
	const userId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		email: `${userId}@example.test`,
		name: "Integration fixture",
	});
	try {
		const [source] = await db
			.insert(studioProjects)
			.values({
				userId,
				title: "Sample project",
				designMode: "mobile",
				designMd: "# Sample design\nFont: Arial",
			})
			.returning();
		const [asset] = await db
			.insert(studioAssets)
			.values({
				userId,
				projectId: source.id,
				filename: "logo.svg",
				mimeType: "image/svg+xml",
				byteLength: 6,
				data: Buffer.from("<svg/>").toString("base64"),
			})
			.returning();
		await db
			.update(studioProjects)
			.set({ logoAssetId: asset.id })
			.where(
				and(
					eq(studioProjects.id, source.id),
					eq(studioProjects.userId, userId),
				),
			);
		const html = `<html><body><img src="${buildStudioAssetUrl(asset.id, userId)}"></body></html>`;
		const [originalFrame] = await db
			.insert(studioFrames)
			.values({
				projectId: source.id,
				name: "Sample screen",
				viewport: "mobile",
				htmlCode: html,
				status: "ready",
			})
			.returning();
		await db.insert(studioRevisions).values({
			projectId: source.id,
			prompt: "Sample project request",
			htmlCode: html,
			version: 1,
		});
		await expect(
			duplicateStudioProject(source.id, crypto.randomUUID()),
		).rejects.toThrow();
		const copy = await duplicateStudioProject(source.id, userId);
		expect(copy.id).not.toBe(source.id);
		expect(copy.userId).toBe(userId);
		expect(copy.designMd).toBe(source.designMd);
		expect(copy.logoAssetId).not.toBe(asset.id);
		const [copiedAsset] = await db
			.select()
			.from(studioAssets)
			.where(
				and(
					eq(studioAssets.projectId, copy.id),
					eq(studioAssets.userId, userId),
				),
			);
		expect(copiedAsset.data).toBe(asset.data);
		const [copiedFrame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, copy.id));
		expect(copiedFrame.id).not.toBe(originalFrame.id);
		expect(copiedFrame.htmlCode).toContain(`id=${copiedAsset.id}`);
		expect(copiedFrame.htmlCode).not.toContain(`id=${asset.id}`);
		await db
			.update(studioFrames)
			.set({ name: "Independent edit" })
			.where(eq(studioFrames.id, copiedFrame.id));
		const [unchanged] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, originalFrame.id));
		expect(unchanged.name).toBe(originalFrame.name);
		const [revision] = await db
			.select()
			.from(studioRevisions)
			.where(eq(studioRevisions.projectId, copy.id));
		expect(revision.version).toBe(1);
		expect(revision.htmlCode).toContain(`id=${copiedAsset.id}`);
	} finally {
		await db.delete(studioAssets).where(eq(studioAssets.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	}
});
