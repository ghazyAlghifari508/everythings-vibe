import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { studioProjects, users } from "@/db/schema";
import {
	createStudioProjectWithJob,
	deleteStudioProject,
	duplicateStudioProject,
	getStudioProject,
	getStudioProjectDetail,
} from "./studio-service";

describe("Studio PRD Persistence & Ownership", () => {
	it("persists PRD content, filename and contentHash with studio project", async () => {
		const userId = crypto.randomUUID();
		await db.insert(users).values({
			id: userId,
			email: `${userId}@example.test`,
			name: "PRD Test User",
		});

		const prdContent = `# CatatDompet PRD\n\n## 1. Overview\nPersonal finance tracking app.\n\n## 2. Core Features\n- Catat Pengeluaran\n- Anggaran Bulanan\n- Laporan Keuangan`;
		const prdFilename = "PRD-CatatDompet.md";

		const { project } = await createStudioProjectWithJob(userId, {
			title: "CatatDompet Mobile",
			prompt: "Buat aplikasi pencatatan keuangan pribadi sesuai PRD",
			designMode: "mobile",
			initialPageCount: 3,
			prdAttachment: {
				filename: prdFilename,
				content: prdContent,
			},
		});

		expect(project.prdContent).toBe(prdContent);
		expect(project.prdFilename).toBe(prdFilename);
		expect(project.prdContentHash).toMatch(/^[a-f0-9]{64}$/);

		// Verify surviving project reopen
		const reopened = await getStudioProject(project.id, userId);
		expect(reopened.prdContent).toBe(prdContent);
		expect(reopened.prdFilename).toBe(prdFilename);
		expect(reopened.prdContentHash).toBe(project.prdContentHash);

		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.project.prdContent).toBe(prdContent);
		expect(detail.project.prdFilename).toBe(prdFilename);

		// Verify duplicate retains PRD context
		const duplicated = await duplicateStudioProject(project.id, userId);
		expect(duplicated.prdContent).toBe(prdContent);
		expect(duplicated.prdFilename).toBe(prdFilename);
		expect(duplicated.prdContentHash).toBe(project.prdContentHash);

		// Verify deletion removes PRD
		await deleteStudioProject(project.id, userId);
		const [deletedProject] = await db
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, project.id),
					eq(studioProjects.userId, userId),
				),
			);
		expect(deletedProject).toBeUndefined();

		// Clean up duplicate
		await deleteStudioProject(duplicated.id, userId);
	});

	it("maintains compatibility for existing projects without a PRD", async () => {
		const userId = crypto.randomUUID();
		await db.insert(users).values({
			id: userId,
			email: `${userId}@example.test`,
			name: "Legacy User",
		});

		const { project } = await createStudioProjectWithJob(userId, {
			title: "Legacy No-PRD Project",
			prompt: "Buat landing page sederhana tanpa dokumen PRD",
			designMode: "web",
			initialPageCount: 2,
		});

		expect(project.prdContent).toBeNull();
		expect(project.prdFilename).toBeNull();
		expect(project.prdContentHash).toBeNull();

		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.project.prdContent).toBeNull();
		expect(detail.project.prdFilename).toBeNull();

		// Cleanup
		await deleteStudioProject(project.id, userId);
	});

	it("prevents collision when prompts are identical but PRD contents differ", async () => {
		const userId = crypto.randomUUID();
		await db.insert(users).values({
			id: userId,
			email: `${userId}@example.test`,
			name: "Dedup Test User",
		});

		const prompt = "Buat aplikasi marketplace produk lokal Indonesia";

		const first = await createStudioProjectWithJob(userId, {
			prompt,
			prdAttachment: {
				filename: "market-v1.md",
				content:
					"# Marketplace V1\nFokus pada produk fashion dan kerajinan tangan.",
			},
		});

		const secondWithDifferentPrd = await createStudioProjectWithJob(userId, {
			prompt,
			prdAttachment: {
				filename: "market-v2.md",
				content:
					"# Marketplace V2\nFokus pada kuliner dan rempah-rempah nusantara.",
			},
		});

		expect(secondWithDifferentPrd.project.id).not.toBe(first.project.id);
		expect(secondWithDifferentPrd.project.prdContentHash).not.toBe(
			first.project.prdContentHash,
		);

		// Same prompt AND same PRD within 10s should deduplicate
		const thirdWithSamePrd = await createStudioProjectWithJob(userId, {
			prompt,
			prdAttachment: {
				filename: "market-v2.md",
				content:
					"# Marketplace V2\nFokus pada kuliner dan rempah-rempah nusantara.",
			},
		});
		expect(thirdWithSamePrd.project.id).toBe(secondWithDifferentPrd.project.id);

		// Cleanup
		await deleteStudioProject(first.project.id, userId);
		await deleteStudioProject(secondWithDifferentPrd.project.id, userId);
	});
});
