import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/db";
import {
	studioAssets,
	studioFrames,
	studioJobs,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import {
	buildStudioAssetUrl,
	deleteStudioProject,
	listStudioProjects,
} from "./studio-service";

async function createOwner(): Promise<string> {
	const userId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		email: `${userId}@example.test`,
		name: "Deletion fixture",
	});
	return userId;
}

async function seedProject(userId: string, title: string) {
	const [project] = await db
		.insert(studioProjects)
		.values({ userId, title, designMode: "mobile" })
		.returning();
	const [logo] = await db
		.insert(studioAssets)
		.values({
			userId,
			projectId: project.id,
			filename: "logo.svg",
			mimeType: "image/svg+xml",
			byteLength: 6,
			data: Buffer.from("<svg/>").toString("base64"),
		})
		.returning();
	await db
		.update(studioProjects)
		.set({ logoAssetId: logo.id })
		.where(eq(studioProjects.id, project.id));
	const [visual] = await db
		.insert(studioAssets)
		.values({
			userId,
			projectId: project.id,
			filename: "visual-abc-390x844.jpg",
			mimeType: "image/jpeg",
			byteLength: 4,
			data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
		})
		.returning();
	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId: project.id,
			name: "Screen",
			viewport: "mobile",
			htmlCode: `<html><body><img src="${buildStudioAssetUrl(logo.id, userId)}"></body></html>`,
			status: "ready",
		})
		.returning();
	await db.insert(studioRevisions).values({
		projectId: project.id,
		prompt: "Fixture request",
		htmlCode: "<html><body>v1</body></html>",
		version: 1,
	});
	const [job] = await db
		.insert(studioJobs)
		.values({
			projectId: project.id,
			userId,
			prompt: "Fixture request",
			jobType: "initial",
			status: "generating",
		})
		.returning();
	return { project, frame, logo, visual, job };
}

it("deletes every project-owned record and leaves other owners untouched", async () => {
	const ownerId = await createOwner();
	const otherId = await createOwner();
	try {
		const owned = await seedProject(ownerId, "Owned project");
		const foreign = await seedProject(otherId, "Foreign project");

		const result = await deleteStudioProject(owned.project.id, ownerId);
		expect(result.id).toBe(owned.project.id);

		expect(
			await db
				.select()
				.from(studioProjects)
				.where(eq(studioProjects.id, owned.project.id)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, owned.project.id)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(studioRevisions)
				.where(eq(studioRevisions.projectId, owned.project.id)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, owned.project.id)),
		).toHaveLength(0);
		// studio_assets.project_id has no foreign key, so orphaned generated
		// visuals and the logo asset must be removed explicitly.
		const remainingAssets = await db
			.select()
			.from(studioAssets)
			.where(eq(studioAssets.userId, ownerId));
		expect(remainingAssets).toHaveLength(0);

		expect(
			await db
				.select()
				.from(studioProjects)
				.where(eq(studioProjects.id, foreign.project.id)),
		).toHaveLength(1);
		expect(
			await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, foreign.project.id)),
		).toHaveLength(1);
		expect(
			await db
				.select()
				.from(studioAssets)
				.where(eq(studioAssets.projectId, foreign.project.id)),
		).toHaveLength(2);

		// History reconciliation: the deleted project disappears from the list.
		const history = await listStudioProjects(ownerId);
		expect(history.some((entry) => entry.id === owned.project.id)).toBe(false);
	} finally {
		await db.delete(studioAssets).where(eq(studioAssets.userId, ownerId));
		await db.delete(studioAssets).where(eq(studioAssets.userId, otherId));
		await db.delete(users).where(eq(users.id, ownerId));
		await db.delete(users).where(eq(users.id, otherId));
	}
});

it("refuses to delete another user's project even when the id is supplied", async () => {
	const ownerId = await createOwner();
	const attackerId = await createOwner();
	try {
		const owned = await seedProject(ownerId, "Protected project");
		await expect(
			deleteStudioProject(owned.project.id, attackerId),
		).rejects.toThrow(/tidak ditemukan/i);
		// Ownership failure must not partially delete the owner's data.
		expect(
			await db
				.select()
				.from(studioProjects)
				.where(
					and(
						eq(studioProjects.id, owned.project.id),
						eq(studioProjects.userId, ownerId),
					),
				),
		).toHaveLength(1);
		expect(
			await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, owned.project.id)),
		).toHaveLength(1);
	} finally {
		await db.delete(studioAssets).where(eq(studioAssets.userId, ownerId));
		await db.delete(users).where(eq(users.id, ownerId));
		await db.delete(users).where(eq(users.id, attackerId));
	}
});

it("treats a repeated delete as a stale reference instead of resurrecting data", async () => {
	const ownerId = await createOwner();
	try {
		const owned = await seedProject(ownerId, "Duplicate delete project");
		await deleteStudioProject(owned.project.id, ownerId);
		await expect(
			deleteStudioProject(owned.project.id, ownerId),
		).rejects.toThrow(/tidak ditemukan/i);
		expect(
			await db
				.select()
				.from(studioProjects)
				.where(eq(studioProjects.id, owned.project.id)),
		).toHaveLength(0);
	} finally {
		await db.delete(studioAssets).where(eq(studioAssets.userId, ownerId));
		await db.delete(users).where(eq(users.id, ownerId));
	}
});

it("serialises concurrent deletes of the same project into one success", async () => {
	const ownerId = await createOwner();
	try {
		const owned = await seedProject(ownerId, "Concurrent delete project");
		const results = await Promise.allSettled([
			deleteStudioProject(owned.project.id, ownerId),
			deleteStudioProject(owned.project.id, ownerId),
		]);
		const fulfilled = results.filter((entry) => entry.status === "fulfilled");
		const rejected = results.filter((entry) => entry.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(
			await db
				.select()
				.from(studioProjects)
				.where(eq(studioProjects.id, owned.project.id)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, owned.project.id)),
		).toHaveLength(0);
	} finally {
		await db.delete(studioAssets).where(eq(studioAssets.userId, ownerId));
		await db.delete(users).where(eq(users.id, ownerId));
	}
});
