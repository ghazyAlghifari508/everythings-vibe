import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
	scrapeDocuments,
	scrapes,
	studioFrames,
	studioJobs,
	users,
} from "@/db/schema";
import { buildFixtureModel } from "@/lib/design-fixture";
import { renderDesignMd } from "@/lib/design-md-render";
import { StudioReferenceError } from "../services/studio-design-reference.server";
import type {
	StudioDesignReference,
	StudioDesignSkillId,
} from "../services/studio-generation-options";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioPresetDesignMd } from "../services/studio-presets";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { getStudioProject } from "../services/studio-project-query";

const provider = vi.hoisted(() => ({
	messages: [] as Array<Array<{ role: string; content: string }>>,
	labels: [] as string[],
}));

// The planning reply mirrors the requested screen count so the pipeline never
// needs a corrective round; frame replies repeat the planned nav labels.
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
	) => {
		provider.messages.push(messages);
		if (messages[0]?.content.includes("planning application screens")) {
			const requested = /exactly (\d+)/.exec(messages[1]?.content ?? "");
			const count = Number(requested?.[1] ?? 2);
			const viewport = "web";
			const screens = Array.from({ length: count }, (_, order) => ({
				name: `Screen ${order}`,
				description: "Sample",
				viewport,
				order,
			}));
			provider.labels = screens.map((screen) => screen.name);
			const destinations = screens.map((_, order) => `screen-${order}`);
			return {
				firstChunk: JSON.stringify({
					projectTitle: "Sample",
					screens,
					blueprint: {
						productIdentity: {
							productName: "Sample",
							targetAudience: "General",
							platform: viewport,
							visualDirection: "Clean",
						},
						designTokens: {
							primary: "#0f0f0f",
							secondary: "#606060",
							background: "#ffffff",
							surface: "#f8f8f8",
							fontFamily: "Arial",
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
							destinations,
							labels: screens.map((screen) => screen.name),
							iconMapping: {},
							ordering: destinations,
							activeItemRule: "Highlight active",
						},
						screenPlan: screens.map((screen) => ({
							name: screen.name,
							role: screen.description,
							order: screen.order,
						})),
					},
				}),
				generator: (async function* () {})(),
			};
		}
		return {
			firstChunk: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><nav>${provider.labels
				.map((label) => `<a href="#">${label}</a>`)
				.join("")}</nav><main>Konten</main></body></html>`,
			generator: (async function* () {})(),
		};
	},
}));

beforeEach(() => {
	provider.messages = [];
	provider.labels = [];
});

const CANONICAL = renderDesignMd(buildFixtureModel());
const THEME_DOC = getStudioPresetDesignMd("workspace") ?? "";

async function createUser(): Promise<string> {
	const userId = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	return userId;
}

async function insertCompletedScrape(
	userId: string,
	designMd: string,
): Promise<string> {
	const [scrape] = await db
		.insert(scrapes)
		.values({
			userId,
			sourceUrl: "https://acme.example/pricing",
			domain: "acme.example",
			mode: "design",
			status: "completed",
		})
		.returning();
	if (!scrape) throw new Error("scrape row not created");
	await db.insert(scrapeDocuments).values({ scrapeId: scrape.id, designMd });
	return scrape.id;
}

// The document head is the cheapest proof that this exact reference — not a
// default, and not another user's reference — reached the model.
function documentHead(designMd: string): string {
	return designMd.trim().slice(0, 40);
}

function aiCalls(kind: "planning" | "frame") {
	return provider.messages.filter((messages) =>
		kind === "planning"
			? messages[0]?.content.includes("planning application screens")
			: !messages[0]?.content.includes("planning application screens"),
	);
}

async function referenceFailure(
	run: Promise<unknown>,
): Promise<StudioReferenceError> {
	const error = await run.catch((cause: unknown) => cause);
	expect(error).toBeInstanceOf(StudioReferenceError);
	if (error instanceof StudioReferenceError) return error;
	throw error;
}

interface Combo {
	skill: StudioDesignSkillId;
	reference: StudioDesignReference;
	designMd: string;
	primary: string;
	cards: string;
}

const COMBOS: Combo[] = [
	{
		skill: "none",
		reference: { kind: "theme", id: "workspace" },
		designMd: THEME_DOC,
		primary: "#2563eb",
		cards: "8px",
	},
	{
		skill: "impeccable",
		reference: { kind: "theme", id: "workspace" },
		designMd: THEME_DOC,
		primary: "#2563eb",
		cards: "8px",
	},
	{
		skill: "none",
		reference: { kind: "scrape", id: "scrape-placeholder" },
		designMd: CANONICAL,
		primary: "#155eef",
		cards: "24px",
	},
	{
		skill: "impeccable",
		reference: { kind: "scrape", id: "scrape-placeholder" },
		designMd: CANONICAL,
		primary: "#155eef",
		cards: "24px",
	},
	{
		skill: "frontend-design",
		reference: { kind: "scrape", id: "scrape-placeholder" },
		designMd: CANONICAL,
		primary: "#155eef",
		cards: "24px",
	},
	{
		skill: "none",
		reference: { kind: "custom", filename: "acme.md" },
		designMd: CANONICAL,
		primary: "#155eef",
		cards: "24px",
	},
	{
		skill: "ui-ux-pro-max",
		reference: { kind: "custom", filename: "acme.md" },
		designMd: CANONICAL,
		primary: "#155eef",
		cards: "24px",
	},
	{
		skill: "taste",
		reference: { kind: "custom", filename: "acme.md" },
		designMd: CANONICAL,
		primary: "#155eef",
		cards: "24px",
	},
];

describe("studio design reference compatibility matrix", () => {
	for (const combo of COMBOS) {
		it(`applies ${combo.reference.kind} + ${combo.skill} to planning and every frame`, async () => {
			const userId = await createUser();
			const reference =
				combo.reference.kind === "scrape"
					? {
							kind: "scrape" as const,
							id: await insertCompletedScrape(userId, combo.designMd),
						}
					: combo.reference;
			const { project, job } = await createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				initialPageCount: 2,
				designSkillId: combo.skill,
				designReference: reference,
				designMd: combo.reference.kind === "custom" ? combo.designMd : null,
			});

			expect(project.designMd).toBe(combo.designMd);
			expect(project.designReference).toMatchObject({
				kind: reference.kind,
				source:
					reference.kind === "theme"
						? "studio-presets"
						: reference.kind === "scrape"
							? "vibescrape"
							: "upload",
			});
			if (reference.kind !== "custom")
				expect(project.designReference?.id).toBe(reference.id);

			await runStudioJobPipeline(job.id, project.id, userId);

			const planning = aiCalls("planning");
			expect(planning).toHaveLength(1);
			const planningUser = planning[0]?.[1]?.content ?? "";
			expect(planningUser).toContain(documentHead(combo.designMd));
			expect(planningUser).toContain(`- Primary Brand Color: ${combo.primary}`);
			expect(planningUser).toContain(`- Card Border Radius: ${combo.cards}`);

			const frames = aiCalls("frame");
			expect(frames).toHaveLength(2);
			for (const messages of frames)
				expect(messages[1]?.content).toContain(documentHead(combo.designMd));

			// A skill refines within the reference contract; it never replaces the
			// reference, and "none" must still receive it.
			const skillClause = "selected design-reference contract";
			expect(planning[0]?.[0]?.content.includes(skillClause)).toBe(
				combo.skill !== "none",
			);
			for (const messages of frames)
				expect(messages[0]?.content.includes(skillClause)).toBe(
					combo.skill !== "none",
				);

			const stored = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.projectId, project.id));
			expect(stored.every((frame) => frame.status === "ready")).toBe(true);
		});
	}

	it("keeps an uploaded logo attached to the persisted project and every frame prompt", async () => {
		const userId = await createUser();
		const { project, job } = await createStudioProjectWithJob(userId, {
			prompt: "Sample application brief",
			initialPageCount: 1,
			designReference: { kind: "custom", filename: "acme.md" },
			designMd: CANONICAL,
			logo: {
				filename: "mark.png",
				mimeType: "image/png",
				data: Buffer.from([
					0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
				]).toString("base64"),
			},
		});
		expect(project.logoAssetId).not.toBeNull();

		await runStudioJobPipeline(job.id, project.id, userId);

		const frames = aiCalls("frame");
		expect(frames).toHaveLength(1);
		for (const messages of frames) {
			const logoUrl = project.logoAssetId
				? `/api/studio/asset?id=${project.logoAssetId}`
				: "";
			expect(messages[1]?.content).toContain(logoUrl);
			expect(messages[1]?.content).toContain(documentHead(CANONICAL));
		}
	});

	it("reads back the persisted reference and document after a reload", async () => {
		const userId = await createUser();
		const { project } = await createStudioProjectWithJob(userId, {
			prompt: "Sample application brief",
			designReference: { kind: "custom", filename: "acme.md" },
			designMd: CANONICAL,
		});
		const reloaded = await getStudioProject(project.id, userId);
		expect(reloaded.designMd).toBe(CANONICAL);
		expect(reloaded.designReference).toMatchObject({
			kind: "custom",
			source: "upload",
			filename: "acme.md",
		});
	});

	it("keeps the reference in a retried frame generation", async () => {
		const userId = await createUser();
		const { project, job } = await createStudioProjectWithJob(userId, {
			prompt: "Sample application brief",
			initialPageCount: 1,
			designReference: { kind: "custom", filename: "acme.md" },
			designMd: CANONICAL,
		});
		await runStudioJobPipeline(job.id, project.id, userId);
		const [frame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id));
		if (!frame) throw new Error("frame row not created");
		const [retry] = await db
			.insert(studioJobs)
			.values({
				projectId: project.id,
				userId,
				prompt: "Perbaiki layar ini",
				jobType: "retry",
				targetFrameId: frame.id,
			})
			.returning();
		if (!retry) throw new Error("retry job not created");
		provider.messages = [];

		await runStudioJobPipeline(retry.id, project.id, userId);

		const frames = aiCalls("frame");
		expect(frames).toHaveLength(1);
		expect(frames[0]?.[1]?.content).toContain(documentHead(CANONICAL));
	});

	it("reports an invalid custom document as its own recoverable failure", async () => {
		const userId = await createUser();
		const error = await referenceFailure(
			createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				designReference: { kind: "custom", filename: "broken.md" },
				designMd: "# Broken\n| Canvas | #12345 | Background |",
			}),
		);
		expect(error.failure).toBe("invalid-design-file");
		expect(error.message).toBe(
			"File desain belum bisa digunakan. Periksa isinya lalu unggah kembali.",
		);

		const unknownTheme = await referenceFailure(
			createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				designReference: { kind: "theme", id: "no-such-theme" },
			}),
		);
		expect(unknownTheme.failure).toBe("unknown-theme");
	});

	it("refuses a scrape reference owned by another user without touching the owner's row", async () => {
		const owner = await createUser();
		const intruder = await createUser();
		const scrapeId = await insertCompletedScrape(owner, CANONICAL);

		const error = await referenceFailure(
			createStudioProjectWithJob(intruder, {
				prompt: "Sample application brief",
				designReference: { kind: "scrape", id: scrapeId },
			}),
		);
		expect(error.failure).toBe("source-unavailable");

		const [document] = await db
			.select()
			.from(scrapeDocuments)
			.where(eq(scrapeDocuments.scrapeId, scrapeId));
		expect(document?.designMd).toBe(CANONICAL);
		expect(
			await db
				.select()
				.from(scrapes)
				.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, owner))),
		).toHaveLength(1);
	});

	it("reports a deleted or incomplete source as unavailable", async () => {
		const userId = await createUser();
		const missing = await referenceFailure(
			createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				designReference: { kind: "scrape", id: crypto.randomUUID() },
			}),
		);
		expect(missing.failure).toBe("source-unavailable");

		const [failed] = await db
			.insert(scrapes)
			.values({
				userId,
				sourceUrl: "https://acme.example/pricing",
				domain: "acme.example",
				mode: "design",
				status: "failed",
			})
			.returning();
		if (!failed) throw new Error("scrape row not created");
		const incomplete = await referenceFailure(
			createStudioProjectWithJob(userId, {
				prompt: "Sample application brief",
				designReference: { kind: "scrape", id: failed.id },
			}),
		);
		expect(incomplete.failure).toBe("source-unavailable");
	});
});
