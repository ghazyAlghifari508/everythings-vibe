import { asc, eq } from "drizzle-orm";
import { afterEach, expect, it } from "vitest";
import { db } from "@/db";
import { studioFrames, studioProjects, users } from "@/db/schema";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { deriveStudioScreenSuggestions } from "../services/studio-screen-suggestions";

const owners: string[] = [];

async function seed() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: "CatatDompet",
			designMode: "mobile",
			prdContent:
				"# CatatDompet\n\nModul: mencatat transaksi harian, menyusun anggaran bulanan, dan meninjau laporan.",
		})
		.returning();
	const [beranda] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Beranda",
			order: 0,
			htmlCode: "<html><head></head><body>Beranda ready</body></html>",
			status: "ready",
		})
		.returning();
	if (!project || !beranda) throw new Error("seed failed");
	return { userId, project, beranda };
}

async function suggestionsFor(projectId: string, userId: string) {
	const detail = await getStudioProjectDetail(projectId, userId);
	return deriveStudioScreenSuggestions({
		projectId: detail.project.id,
		projectTitle: detail.project.title,
		designMode: detail.project.designMode === "mobile" ? "mobile" : "web",
		designBlueprintVersion: detail.project.designBlueprintVersion,
		prdContent: detail.project.prdContent,
		prdContentHash: detail.project.prdContentHash,
		blueprint: detail.project.designBlueprint,
		frameNames: detail.frames.map((frame) => frame.name),
	});
}

afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
});

it("turns a suggestion bubble into exactly one new screen and keeps the rest", async () => {
	const { userId, project, beranda } = await seed();
	const suggestion = (await suggestionsFor(project.id, userId)).find(
		(entry) => entry.label === "Buat Catat Transaksi",
	);
	if (!suggestion) throw new Error("expected a transaction suggestion");

	const accepted = await enqueueStudioOperation(project.id, userId, {
		prompt: suggestion.prompt,
		requestId: crypto.randomUUID(),
	});
	expect(accepted.intent).toBe("add_screen");
	if (accepted.intent !== "add_screen") throw new Error("expected add_screen");
	expect(accepted.frames).toHaveLength(1);
	expect(accepted.frames[0]?.name).toBe("Catat Transaksi");
	expect(accepted.jobs[0]?.jobType).toBe("add");

	const stored = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	// Adding the suggested screen never regenerates the existing one.
	const untouched = stored.find((frame) => frame.id === beranda.id);
	expect(untouched?.status).toBe("ready");
	expect(untouched?.htmlCode).toBe(beranda.htmlCode);

	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames.map((frame) => frame.name)).toEqual([
		"Beranda",
		"Catat Transaksi",
	]);
});

it("stops proposing a screen once its suggestion has been added", async () => {
	const { userId, project } = await seed();
	const suggestion = (await suggestionsFor(project.id, userId)).find(
		(entry) => entry.label === "Buat Laporan",
	);
	if (!suggestion) throw new Error("expected a report suggestion");
	await enqueueStudioOperation(project.id, userId, {
		prompt: suggestion.prompt,
		requestId: crypto.randomUUID(),
	});

	const labels = (await suggestionsFor(project.id, userId)).map(
		(entry) => entry.label,
	);
	expect(labels).not.toContain("Buat Laporan");
});

it("refuses a suggested screen for a project the caller does not own", async () => {
	const { userId, project } = await seed();
	const suggestion = (await suggestionsFor(project.id, userId))[0];
	if (!suggestion) throw new Error("expected a suggestion");

	await expect(
		enqueueStudioOperation(project.id, crypto.randomUUID(), {
			prompt: suggestion.prompt,
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();

	const stored = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id));
	expect(stored).toHaveLength(1);
});

it("rejects a second add for a screen name that now exists", async () => {
	const { userId, project } = await seed();
	const suggestion = (await suggestionsFor(project.id, userId))[0];
	if (!suggestion) throw new Error("expected a suggestion");
	await enqueueStudioOperation(project.id, userId, {
		prompt: suggestion.prompt,
		requestId: crypto.randomUUID(),
	});

	await expect(
		enqueueStudioOperation(project.id, userId, {
			prompt: suggestion.prompt,
			requestId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
});
