import { asc, eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	studioFrames,
	studioProjects,
	studioRevisions,
	users,
} from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { enqueueStudioOperation } from "../services/studio-operation-enqueue";
import { getStudioProjectDetail } from "../services/studio-project-detail";

const generation = vi.hoisted(() => ({
	calls: [] as Array<{
		framePrompt: string;
		activeScreen: string;
		designSkillId: string;
		blueprintProduct: string | null;
	}>,
	failure: null as Error | null,
}));

// The provider is the only thing mocked: intent resolution, persistence, the
// worker pipeline and prompt assembly all run for real.
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
			designSkillId: string;
			blueprint: { productIdentity?: { productName?: string } } | null;
		}) => {
			generation.calls.push({
				framePrompt: input.framePrompt,
				activeScreen: input.activeScreen,
				designSkillId: input.designSkillId,
				blueprintProduct: input.blueprint?.productIdentity?.productName ?? null,
			});
			if (generation.failure) throw generation.failure;
			return `<html><head></head><body>${input.activeScreen}</body></html>`;
		},
	};
});

const BLUEPRINT = {
	productIdentity: {
		productName: "Kasir Cepat",
		targetAudience: "Pemilik warung",
		platform: "web" as const,
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Top tabs",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["overview", "entry"],
		labels: ["Overview", "Entry"],
		iconMapping: { overview: "home", entry: "plus" },
		ordering: ["overview", "entry"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{ name: "Dashboard", role: "Summary", order: 0 },
		{ name: "Transaksi", role: "List", order: 1 },
		{ name: "Laporan", role: "Report", order: 2 },
		{ name: "Pengaturan", role: "Settings", order: 3 },
	],
};

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
			title: "Kasir",
			designMd: "## Tokens\n--app-primary: #123456",
			designSkillId: "impeccable",
			designBlueprint: BLUEPRINT,
			prdContent: "Modul: penjualan, stok, laporan.",
		})
		.returning();
	const frames = await db
		.insert(studioFrames)
		.values(
			["Dashboard", "Transaksi", "Laporan", "Pengaturan"].map(
				(name, order) => ({
					projectId: project.id,
					name,
					order,
					htmlCode: `<html><head></head><body>${name} ready</body></html>`,
					status: "ready" as const,
				}),
			),
		)
		.returning();
	return { userId, project, frames };
}

async function runAcceptedAdd(projectId: string, userId: string) {
	const accepted = await enqueueStudioOperation(projectId, userId, {
		prompt:
			"Tambah halaman Profile dengan informasi akun dan preferensi pengguna",
		requestId: crypto.randomUUID(),
	});
	if (accepted.intent !== "add_screen") throw new Error("expected add_screen");
	const job = accepted.jobs[0];
	if (!job) throw new Error("expected one add job");
	await runStudioJobPipeline(job.id, projectId, userId);
	return accepted;
}

afterEach(async () => {
	for (const id of owners.splice(0))
		await db.delete(users).where(eq(users.id, id));
	generation.calls = [];
	generation.failure = null;
});

it("generates only the added screen with the project's shared context", async () => {
	const { userId, project, frames } = await seed();
	const accepted = await runAcceptedAdd(project.id, userId);
	expect(accepted.frames[0]?.name).toBe("Profile");

	// Exactly one generation, for the new screen only.
	expect(generation.calls).toHaveLength(1);
	const call = generation.calls[0];
	expect(call?.activeScreen).toBe("Profile");
	// Shared DESIGN.md tokens and skill are reused.
	expect(call?.framePrompt).toContain("#123456");
	expect(call?.designSkillId).toBe("impeccable");
	// The new screen follows the project's shared blueprint and screen list.
	expect(call?.blueprintProduct).toBe("Kasir Cepat");
	expect(call?.framePrompt).toContain("SHARED_DESIGN_BLUEPRINT");
	expect(call?.framePrompt).toContain("Kasir Cepat");
	expect(call?.framePrompt).toContain(
		"Dashboard, Transaksi, Laporan, Pengaturan, Profile",
	);

	// Existing frames keep their HTML and ready state.
	const stored = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	for (const frame of frames) {
		const after = stored.find((entry) => entry.id === frame.id);
		expect(after?.status).toBe("ready");
		expect(after?.htmlCode).toBe(frame.htmlCode);
	}
	const added = stored.find((frame) => frame.name === "Profile");
	expect(added?.status).toBe("ready");
	expect(added?.htmlCode).toContain("Profile");

	// The completed screen is recorded in project history and survives a reload.
	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, project.id));
	expect(revisions).toHaveLength(1);
	expect(revisions[0]?.prompt).toContain("Profile dengan informasi akun");
	const detail = await getStudioProjectDetail(project.id, userId);
	expect(detail.frames.map((frame) => frame.name)).toContain("Profile");
	expect(detail.revisions).toHaveLength(1);
});

it("keeps every existing frame when the added screen fails", async () => {
	const { userId, project, frames } = await seed();
	generation.failure = new Error("provider failed");
	await runAcceptedAdd(project.id, userId);

	const stored = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	for (const frame of frames) {
		const after = stored.find((entry) => entry.id === frame.id);
		expect(after?.status).toBe("ready");
		expect(after?.htmlCode).toBe(frame.htmlCode);
	}
	const added = stored.find((frame) => frame.name === "Profile");
	expect(added?.status).toBe("failed");
	expect(added?.htmlCode).toBeNull();
});
