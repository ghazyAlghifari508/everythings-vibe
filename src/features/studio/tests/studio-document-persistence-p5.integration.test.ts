import { and, eq } from "drizzle-orm";
import { afterEach, expect, it } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { assembleCanonicalShell } from "../services/studio-canonical-shell";
import {
	finalizeStudioFrameDetail,
	readStudioFrameDocument,
} from "../services/studio-frame-document";
import { webSaaSBlueprint } from "./fixtures/studio-evaluation-fixtures";

const owners: string[] = [];
afterEach(async () => {
	for (const owner of owners.splice(0))
		await db.delete(users).where(eq(users.id, owner));
});

it("persists refreshed canonical HTML once, keeps revision history, rejects another tenant", async () => {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@p5.test`, name: "P5" });
	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: "P5",
			designMode: "web",
			designBlueprint: webSaaSBlueprint,
		})
		.returning();
	const html = assembleCanonicalShell(
		"<html><head></head><body><main data-studio-content><h1>Dashboard</h1><p>Saved content</p></main></body></html>",
		webSaaSBlueprint,
		"Dashboard",
		null,
	).replace(
		/<style id="studio-canonical-style">[\s\S]*?<\/style>/,
		'<style id="studio-canonical-style">body{margin:99px}</style>',
	);
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Dashboard",
			viewport: "web",
			status: "ready",
			order: 0,
			htmlCode: html,
			revision: 3,
			visualHash: "old-visual",
		})
		.returning();
	await db.insert(studioRevisions).values({
		projectId: project.id,
		prompt: "Saved",
		htmlCode: html,
		version: 1,
	});
	await expect(
		readStudioFrameDocument(project.id, frame.id, crypto.randomUUID()),
	).rejects.toThrow();
	const final = await readStudioFrameDocument(project.id, frame.id, userId);
	const [saved] = await db
		.select()
		.from(studioFrames)
		.where(
			and(
				eq(studioFrames.id, frame.id),
				eq(studioFrames.projectId, project.id),
			),
		);
	expect(saved.htmlCode).toBe(final.html);
	expect(final.html).not.toBe(html);
	expect(saved.revision).toBe(3);
	expect(saved.visualHash).toBeNull();
	const again = await readStudioFrameDocument(project.id, frame.id, userId);
	const [unchanged] = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.id, frame.id));
	expect(again.html).toBe(final.html);
	expect(unchanged.updatedAt).toEqual(saved.updatedAt);
	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, project.id));
	expect(
		revisions.map((entry) => ({
			htmlCode: entry.htmlCode,
			version: entry.version,
		})),
	).toEqual([{ htmlCode: html, version: 1 }]);
});

it("does not overwrite a concurrent content revision while refreshing the shell", async () => {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@p5.test`, name: "P5" });
	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: "P5",
			designMode: "web",
			designBlueprint: webSaaSBlueprint,
		})
		.returning();
	const staleHtml = assembleCanonicalShell(
		"<html><head></head><body><main data-studio-content><h1>Dashboard</h1><p>Old revision</p></main></body></html>",
		webSaaSBlueprint,
		"Dashboard",
		null,
	);
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Dashboard",
			viewport: "web",
			status: "ready",
			order: 0,
			htmlCode: staleHtml,
			revision: 1,
		})
		.returning();
	const editedHtml = staleHtml.replace("Old revision", "User revision");
	await db
		.update(studioFrames)
		.set({ htmlCode: editedHtml, revision: 2 })
		.where(eq(studioFrames.id, frame.id));
	await expect(
		finalizeStudioFrameDetail(project, frame, null),
	).rejects.toMatchObject({ code: "STUDIO_STALE_REVISION" });
	const [saved] = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.id, frame.id));
	expect(saved.htmlCode).toBe(editedHtml);
	expect(saved.revision).toBe(2);
});
