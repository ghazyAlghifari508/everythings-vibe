import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";

async function createOwner(): Promise<string> {
	const userId = crypto.randomUUID();
	await db.insert(users).values({
		id: userId,
		email: `${userId}@example.test`,
		name: "Persistence fixture",
	});
	return userId;
}

describe("p2 persistence schema", () => {
	it("menyimpan blueprint tervalidasi pada project", async () => {
		const userId = await createOwner();
		const [project] = await db
			.insert(studioProjects)
			.values({
				userId,
				title: "Kopi",
				designMode: "mobile",
				designBlueprint: {
					productIdentity: {
						productName: "Kopi",
						targetAudience: "Umum",
						platform: "mobile",
						visualDirection: "Hangat",
					},
					designTokens: {
						primary: "#0f0f0f",
						secondary: "#606060",
						background: "#ffffff",
						surface: "#f8f8f8",
						fontFamily: "system-ui",
						radius: 12,
						border: "1px solid #d3d3d3",
						elevation: "none",
					},
					sharedComponents: {
						header: "Bar",
						navigation: "Tabs",
						buttons: "Ink",
						inputs: "8px",
						cards: "12px",
						tabs: "Seg",
						icons: "Lucide",
					},
					navigationContract: {
						destinations: ["jelajah", "kustom"],
						labels: ["Jelajah", "Kustom"],
						iconMapping: { jelajah: "compass", kustom: "sliders" },
						ordering: ["jelajah", "kustom"],
						activeItemRule: "Highlight sesuai screen aktif",
					},
					screenPlan: [{ name: "Jelajah", role: "Katalog", order: 0 }],
				},
				designBlueprintVersion: 1,
			})
			.returning();
		expect(project.designBlueprintVersion).toBe(1);
		expect(project.designBlueprint?.productIdentity.productName).toBe("Kopi");
		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
		await db.delete(users).where(eq(users.id, userId));
	});

	it("menolak duplikat order dalam project yang sama", async () => {
		const userId = await createOwner();
		const [project] = await db
			.insert(studioProjects)
			.values({ userId, title: "Kopi", designMode: "mobile" })
			.returning();
		await db.insert(studioFrames).values({
			projectId: project.id,
			name: "Layar 1",
			viewport: "mobile",
			order: 0,
			status: "queued",
		});
		await expect(
			db.insert(studioFrames).values({
				projectId: project.id,
				name: "Layar 1 duplikat",
				viewport: "mobile",
				order: 0,
				status: "queued",
			}),
		).rejects.toThrow();
		await db.delete(studioFrames).where(eq(studioFrames.projectId, project.id));
		await db.delete(studioJobs).where(eq(studioJobs.projectId, project.id));
		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
		await db.delete(users).where(eq(users.id, userId));
	});
});
