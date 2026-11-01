import { asc, eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { normalizeDestinationId } from "../services/studio-blueprint-navigation";
import { assembleCanonicalShell } from "../services/studio-canonical-shell";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { studioVisualHash } from "../services/studio-visual";

function safeHtml(code: string | null | undefined): string {
	if (!code) throw new Error("Expected htmlCode to be non-null");
	return code;
}

function safeBlueprint(
	bp: StudioDesignBlueprint | null | undefined,
): StudioDesignBlueprint {
	if (!bp) throw new Error("Expected designBlueprint to be non-null");
	return bp;
}

const generation = vi.hoisted(() => ({
	calls: [] as Array<{
		framePrompt: string;
		activeScreen: string;
		blueprint: StudioDesignBlueprint | null;
	}>,
	failure: null as Error | null,
}));

vi.mock("../services/studio-frame-generation", async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import("../services/studio-frame-generation")
		>();
	return {
		...original,
		generateValidatedFrameHtml: async (input: {
			framePrompt: string;
			activeScreen: string;
			blueprint: StudioDesignBlueprint | null;
			dsTokens: null;
			logoUrl?: string | null;
		}) => {
			generation.calls.push({
				framePrompt: input.framePrompt,
				activeScreen: input.activeScreen,
				blueprint: input.blueprint,
			});
			if (generation.failure) throw generation.failure;
			const rawHtml = `<!DOCTYPE html><html><head></head><body><main data-studio-content="1"><h1>${input.activeScreen}</h1><p>Konten layar ${input.activeScreen}</p></main></body></html>`;
			if (input.blueprint) {
				return assembleCanonicalShell(
					rawHtml,
					input.blueprint,
					input.activeScreen,
					input.dsTokens,
					input.logoUrl,
				);
			}
			return rawHtml;
		},
	};
});

const INITIAL_BLUEPRINT: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Kasir Pro",
		targetAudience: "UMKM Indonesia",
		platform: "web",
		visualDirection: "Clean Modern",
	},
	designTokens: {
		primary: "#0284c7",
		secondary: "#64748b",
		background: "#f8fafc",
		surface: "#ffffff",
		fontFamily: "Inter, sans-serif",
		radius: 8,
		border: "1px solid #e2e8f0",
		elevation: "none",
	},
	sharedComponents: {
		header: "Standard Header",
		navigation: "Sidebar Nav",
		buttons: "Primary Accent",
		inputs: "Clean Border",
		cards: "Surface Card",
		tabs: "Underline Tabs",
		icons: "Outline Icons",
	},
	navigationContract: {
		destinations: ["ikhtisar", "pelanggan", "laporan"],
		labels: ["Ikhtisar", "Pelanggan", "Laporan"],
		iconMapping: {
			ikhtisar: "home",
			pelanggan: "user",
			laporan: "analytics",
		},
		ordering: ["ikhtisar", "pelanggan", "laporan"],
		activeItemRule: "Match destination id with active page",
	},
	canonicalShell: {
		version: 1,
		navigation: "sidebar",
		statusBar: "none",
		density: "comfortable",
		activeDestinations: {
			Ikhtisar: "ikhtisar",
			Pelanggan: "pelanggan",
			Laporan: "laporan",
		},
	},
	screenPlan: [
		{ name: "Ikhtisar", role: "Dashboard utama", order: 0 },
		{ name: "Pelanggan", role: "Manajemen kontak pelanggan", order: 1 },
		{ name: "Laporan", role: "Laporan keuangan dan laba rugi", order: 2 },
	],
};

const owners: string[] = [];

async function seedThreeScreenProject() {
	const userId = crypto.randomUUID();
	owners.push(userId);
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });

	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: "Kasir Pro",
			designMode: "web",
			designBlueprint: INITIAL_BLUEPRINT,
			designSkillId: "impeccable",
			prdContent:
				"Modul: Ikhtisar penjualan, data pelanggan, laporan laba rugi.",
		})
		.returning();

	const frameRows = await Promise.all(
		INITIAL_BLUEPRINT.screenPlan.map(async (screen) => {
			const rawHtml = `<!DOCTYPE html><html><head></head><body><main data-studio-content="1"><h1>${screen.name}</h1><p>Konten layar ${screen.name}</p></main></body></html>`;
			const htmlCode = assembleCanonicalShell(
				rawHtml,
				INITIAL_BLUEPRINT,
				screen.name,
				null,
			);
			return {
				projectId: project.id,
				name: screen.name,
				order: screen.order,
				htmlCode,
				status: "ready" as const,
			};
		}),
	);

	const frames = await db.insert(studioFrames).values(frameRows).returning();
	return { userId, project, frames };
}

afterEach(async () => {
	for (const id of owners.splice(0)) {
		await db.delete(users).where(eq(users.id, id));
	}
	generation.calls = [];
	generation.failure = null;
});

describe("TASK 05 — Shared Navigation Consistency When Adding Screens", () => {
	// 1. Initial three-screen project
	it("initializes three-screen project with matching navigation structure", async () => {
		const { project, frames } = await seedThreeScreenProject();
		expect(frames).toHaveLength(3);
		expect(
			safeBlueprint(project.designBlueprint).navigationContract.destinations,
		).toEqual(["ikhtisar", "pelanggan", "laporan"]);
		for (const frame of frames) {
			const dom = new JSDOM(safeHtml(frame.htmlCode));
			const navLinks = dom.window.document.querySelectorAll(
				"[data-studio-navigation] a[data-destination]",
			);
			expect(navLinks).toHaveLength(3);
		}
	});

	// 2. Add one new primary destination
	it("adds one new primary destination and updates shared navigation across all screens", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const enqueued = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman baru untuk Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		expect(enqueued.intent).toBe("add_screen");
		if (enqueued.intent !== "add_screen")
			throw new Error("expected add_screen");

		await runStudioJobPipeline(enqueued.jobs[0].id, project.id, userId);

		const updatedProject = (await getStudioProjectDetail(project.id, userId))
			.project;
		const bp = safeBlueprint(updatedProject.designBlueprint);
		expect(bp.navigationContract.destinations).toContain("catat-transaksi");
		expect(bp.navigationContract.labels).toContain("Catat Transaksi");
		expect(bp.canonicalShell?.activeDestinations["Catat Transaksi"]).toBe(
			"catat-transaksi",
		);

		const storedFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id))
			.orderBy(asc(studioFrames.order));
		expect(storedFrames).toHaveLength(4);

		// Every existing frame now has 4 navigation items
		for (const frame of storedFrames) {
			const dom = new JSDOM(safeHtml(frame.htmlCode));
			const navLinks = Array.from(
				dom.window.document.querySelectorAll(
					"[data-studio-navigation] a[data-destination]",
				),
			).map((el) => el.getAttribute("data-destination"));
			expect(navLinks).toContain("catat-transaksi");
		}
	});

	// 3. Add one contextual detail screen
	it("adds a contextual detail screen without polluting primary navigation", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const enqueued = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Detail Pelanggan dengan riwayat pesanan",
			requestId: crypto.randomUUID(),
		});
		if (enqueued.intent !== "add_screen")
			throw new Error("expected add_screen");
		await runStudioJobPipeline(enqueued.jobs[0].id, project.id, userId);

		const detail = await getStudioProjectDetail(project.id, userId);
		const bp = safeBlueprint(detail.project.designBlueprint);
		// Global destinations stay at 3 items
		expect(bp.navigationContract.destinations).toEqual([
			"ikhtisar",
			"pelanggan",
			"laporan",
		]);
		// Detail Pelanggan is present in screenPlan and mapped to parent "pelanggan"
		expect(bp.screenPlan.map((s) => s.name)).toContain("Detail Pelanggan");
		expect(bp.canonicalShell?.activeDestinations["Detail Pelanggan"]).toBe(
			"pelanggan",
		);
	});

	// 4. Add multiple screens
	it("maintains monotonic orders and valid ordering when adding multiple screens", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add1 = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Pengaturan",
			requestId: crypto.randomUUID(),
		});
		if (add1.intent !== "add_screen") throw new Error("expected add_screen");
		await runStudioJobPipeline(add1.jobs[0].id, project.id, userId);

		const add2 = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add2.intent !== "add_screen") throw new Error("expected add_screen");
		await runStudioJobPipeline(add2.jobs[0].id, project.id, userId);

		const detail = await getStudioProjectDetail(project.id, userId);
		const bp = safeBlueprint(detail.project.designBlueprint);
		const orders = bp.screenPlan.map((s) => s.order);
		expect(new Set(orders).size).toBe(orders.length);
		expect(orders).toEqual([0, 1, 2, 3, 4]);
		expect(bp.navigationContract.ordering).toHaveLength(5);
	});

	// 5. Duplicate screen names
	it("safely rejects duplicate screen additions", async () => {
		const { userId, project } = await seedThreeScreenProject();
		await expect(
			enqueueStudioOperation(project.id, userId, {
				prompt: "Tambahkan halaman Ikhtisar",
				requestId: crypto.randomUUID(),
			}),
		).rejects.toThrow();
	});

	// 6. Stable navigation IDs
	it("generates deterministic, stable navigation IDs", () => {
		expect(normalizeDestinationId("Catat Transaksi")).toBe("catat-transaksi");
		expect(normalizeDestinationId("Laporan & Keuangan!")).toBe(
			"laporan-keuangan",
		);
		expect(normalizeDestinationId("Ikhtisar", ["ikhtisar"])).toBe("ikhtisar-2");
	});

	// 7. Correct active destination for every screen
	it("maps correct active destination for every screen type", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("expected add_screen");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const storedFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id));

		for (const frame of storedFrames) {
			const dom = new JSDOM(safeHtml(frame.htmlCode));
			const activeLink = dom.window.document.querySelector(
				'[data-studio-navigation] a[aria-current="page"]',
			);
			expect(activeLink).not.toBeNull();
			const expectedDest =
				frame.name === "Catat Transaksi"
					? "catat-transaksi"
					: frame.name.toLowerCase();
			expect(activeLink?.getAttribute("data-destination")).toBe(expectedDest);
		}
	});

	// 8. Blueprint persistence
	it("persists updated blueprint to studioProjects table", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("expected add_screen");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const [persisted] = await db
			.select()
			.from(studioProjects)
			.where(eq(studioProjects.id, project.id));
		expect(
			persisted?.designBlueprint?.navigationContract.destinations,
		).toContain("catat-transaksi");
	});

	// 9. Existing HTML body unchanged after addition
	it("preserves existing screen bodies verbatim without AI regeneration", async () => {
		const { userId, project, frames } = await seedThreeScreenProject();
		const originalBodies = frames.map((f) => {
			const dom = new JSDOM(safeHtml(f.htmlCode));
			return dom.window.document.querySelector("main[data-studio-content]")
				?.innerHTML;
		});

		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("expected add_screen");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		// Exactly 1 AI generation occurred, only for the new screen
		expect(generation.calls).toHaveLength(1);
		expect(generation.calls[0].activeScreen).toBe("Catat Transaksi");

		const updatedFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id))
			.orderBy(asc(studioFrames.order));

		for (let i = 0; i < 3; i++) {
			const dom = new JSDOM(safeHtml(updatedFrames[i].htmlCode));
			const bodyHtml = dom.window.document.querySelector(
				"main[data-studio-content]",
			)?.innerHTML;
			expect(bodyHtml).toBe(originalBodies[i]);
		}
	});

	// 10. Export reflects correct navigation
	it("produces consistent navigation in exported HTML", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("expected add_screen");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const storedFrames = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id))
			.orderBy(asc(studioFrames.order));

		// All 4 frames have consistent navigation in their stored HTML
		for (const frame of storedFrames) {
			const dom = new JSDOM(safeHtml(frame.htmlCode));
			const links = Array.from(
				dom.window.document.querySelectorAll(
					"[data-studio-navigation] a[data-destination]",
				),
			);
			expect(links).toHaveLength(4);
		}
	});

	// 11. Preview cache correctly invalidated only when needed
	it("updates visual hash for primary additions while keeping contextual additions stable", async () => {
		const { userId, project, frames } = await seedThreeScreenProject();
		const originalHash0 = studioVisualHash(
			safeHtml(frames[0].htmlCode),
			frames[0].viewport,
		);

		// Add primary screen
		const addPrimary = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (addPrimary.intent !== "add_screen") throw new Error("add failed");
		await runStudioJobPipeline(addPrimary.jobs[0].id, project.id, userId);

		const afterPrimary = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frames[0].id));
		const newHash0 = studioVisualHash(
			safeHtml(afterPrimary[0].htmlCode),
			afterPrimary[0].viewport,
		);
		// Primary addition changed navigation, so hash changed
		expect(newHash0).not.toBe(originalHash0);

		// Add contextual screen
		const addContextual = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Detail Pelanggan",
			requestId: crypto.randomUUID(),
		});
		if (addContextual.intent !== "add_screen") throw new Error("add failed");
		await runStudioJobPipeline(addContextual.jobs[0].id, project.id, userId);

		const afterContextual = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, frames[0].id));
		const hashAfterContextual = studioVisualHash(
			safeHtml(afterContextual[0].htmlCode),
			afterContextual[0].viewport,
		);
		// Contextual addition does NOT change primary navigation, so hash is identical
		expect(hashAfterContextual).toBe(newHash0);
	});

	// 12. Design reference and skill preserved
	it("preserves tokens, designSkillId and styling references throughout extension", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("add failed");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.project.designSkillId).toBe("impeccable");
		expect(detail.project.designBlueprint?.designTokens).toEqual(
			INITIAL_BLUEPRINT.designTokens,
		);
		expect(detail.project.designBlueprint?.productIdentity).toEqual(
			INITIAL_BLUEPRINT.productIdentity,
		);
	});

	// 13. Failed add-screen operation does not corrupt blueprint
	it("leaves blueprint and existing frames uncorrupted when generation fails", async () => {
		const { userId, project, frames } = await seedThreeScreenProject();
		generation.failure = new Error("AI provider rate limited");

		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("add failed");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const [projectAfter] = await db
			.select()
			.from(studioProjects)
			.where(eq(studioProjects.id, project.id));
		expect(
			projectAfter?.designBlueprint?.navigationContract.destinations,
		).toEqual(["ikhtisar", "pelanggan", "laporan"]);

		const framesAfter = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id))
			.orderBy(asc(studioFrames.order));
		expect(framesAfter[0].htmlCode).toBe(frames[0].htmlCode);
		expect(framesAfter[3].status).toBe("failed");
		expect(framesAfter[3].htmlCode).toBeNull();
	});

	// 14. Reopening project retains consistent navigation
	it("returns fully synchronized project detail on reopen", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("add failed");
		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const detail = await getStudioProjectDetail(project.id, userId);
		expect(detail.frames).toHaveLength(4);
		for (const frame of detail.frames) {
			const dom = new JSDOM(safeHtml(frame.htmlCode));
			expect(
				dom.window.document.querySelectorAll(
					"[data-studio-navigation] a[data-destination]",
				),
			).toHaveLength(4);
		}
	});

	// 15. No duplicate AI jobs for existing frames
	it("queues and executes only 1 job for the added frame", async () => {
		const { userId, project } = await seedThreeScreenProject();
		const add = await enqueueStudioOperation(project.id, userId, {
			prompt: "Tambahkan halaman Catat Transaksi",
			requestId: crypto.randomUUID(),
		});
		if (add.intent !== "add_screen") throw new Error("add failed");
		expect(add.jobs).toHaveLength(1);

		await runStudioJobPipeline(add.jobs[0].id, project.id, userId);

		const jobs = await db
			.select()
			.from(studioJobs)
			.where(eq(studioJobs.projectId, project.id));
		expect(jobs).toHaveLength(1);
		expect(jobs[0].jobType).toBe("add");
		expect(jobs[0].status).toBe("completed");
	});
});
