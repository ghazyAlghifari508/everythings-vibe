import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioFrameRow,
	type InsertStudioRevisionRow,
	type StudioFrameRow,
	studioFrames,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioDesignMode } from "../types/studio-prompts";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { generateValidatedFrameHtml } from "./studio-frame-generation";
import { getStudioProject } from "./studio-project-query";
import {
	validateStudioDesignMode,
	validateStudioPrompt,
} from "./studio-prompt-validation";
import { buildStudioFramePrompt } from "./studio-screen-prompts";

export async function addStudioFrame(
	projectId: string,
	userId: string,
	input: { name: string; prompt: string; viewport?: StudioDesignMode },
): Promise<StudioFrameRow> {
	const detail = await getStudioProject(projectId, userId);
	const checked = validateStudioPrompt(input.prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);

	const existingFrames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId))
		.orderBy(asc(studioFrames.order));

	const maxOrder = existingFrames.reduce(
		(max, f) => Math.max(max, f.order),
		-1,
	);
	const viewport = input.viewport
		? validateStudioDesignMode(input.viewport)
		: validateStudioDesignMode(detail.designMode);
	const cleanName =
		input.name.trim().slice(0, 100) || `Screen ${existingFrames.length + 1}`;

	const [frame] = await db
		.insert(studioFrames)
		.values({
			projectId,
			name: cleanName,
			description: checked.prompt.slice(0, 200),
			viewport,
			order: maxOrder + 1,
			status: "generating",
		} satisfies InsertStudioFrameRow)
		.returning();

	if (!frame) throw new ScrapeError("STORAGE_FAILED");

	try {
		const allNames = [...existingFrames.map((f) => f.name), cleanName];
		const framePrompt = buildStudioFramePrompt({
			screenName: cleanName,
			screenDescription: checked.prompt,
			allScreens: allNames,
			projectPrompt: checked.prompt,
			designMode: viewport,
			designMd: detail.designMd,
			logoUrl: detail.logoUrl,
			blueprint: detail.designBlueprint,
			activeScreen: cleanName,
			prdContent: detail.prdContent,
		});

		const dsTokens = extractDesignSystemTokens(detail.designMd);
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt,
			blueprint: detail.designBlueprint,
			viewport,
			expectTokens: dsTokens !== null,
			designSkillId: detail.designSkillId,
			dsTokens,
			logoUrl: detail.logoUrl,
		});

		const [updated] = await db
			.update(studioFrames)
			.set({ htmlCode, status: "ready", updatedAt: new Date() })
			.where(eq(studioFrames.id, frame.id))
			.returning();

		const nextVersion = (detail.latest?.version ?? 0) + 1;
		await db.insert(studioRevisions).values({
			projectId,
			prompt: `Tambah halaman ${cleanName}: ${checked.prompt}`,
			htmlCode,
			version: nextVersion,
		} satisfies InsertStudioRevisionRow);

		await db
			.update(studioProjects)
			.set({ updatedAt: new Date() })
			.where(eq(studioProjects.id, projectId));

		return updated ?? frame;
	} catch (err) {
		const errorMsg =
			err instanceof Error ? err.message : "Gagal generate frame";
		const [failed] = await db
			.update(studioFrames)
			.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
			.where(eq(studioFrames.id, frame.id))
			.returning();
		return failed ?? frame;
	}
}

export async function reviseStudioFrame(
	projectId: string,
	userId: string,
	frameId: string,
	prompt: string,
): Promise<StudioFrameRow> {
	const detail = await getStudioProject(projectId, userId);
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);

	const [frame] = await db
		.select()
		.from(studioFrames)
		.where(
			and(eq(studioFrames.id, frameId), eq(studioFrames.projectId, projectId)),
		)
		.limit(1);

	if (!frame)
		throw new ScrapeError("WEBSITE_BLOCKED", "Frame tidak ditemukan.");

	await db
		.update(studioFrames)
		.set({ status: "generating", updatedAt: new Date() })
		.where(eq(studioFrames.id, frameId));

	try {
		const existingFrames = await db
			.select({ name: studioFrames.name })
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));

		const framePrompt = buildStudioFramePrompt({
			screenName: frame.name,
			screenDescription: frame.description ?? undefined,
			allScreens: existingFrames.map((f) => f.name),
			projectPrompt: checked.prompt,
			designMode: validateStudioDesignMode(frame.viewport),
			designMd: detail.designMd,
			logoUrl: detail.logoUrl,
			previousHtml: frame.htmlCode ?? undefined,
			blueprint: detail.designBlueprint,
			activeScreen: frame.name,
			prdContent: detail.prdContent,
		});

		const dsTokens = extractDesignSystemTokens(detail.designMd);
		const htmlCode = await generateValidatedFrameHtml({
			framePrompt,
			blueprint: detail.designBlueprint,
			viewport: validateStudioDesignMode(frame.viewport),
			expectTokens: dsTokens !== null,
			designSkillId: detail.designSkillId,
			dsTokens,
			logoUrl: detail.logoUrl,
		});

		const [updated] = await db
			.update(studioFrames)
			.set({ htmlCode, status: "ready", updatedAt: new Date() })
			.where(eq(studioFrames.id, frameId))
			.returning();

		const nextVersion = (detail.latest?.version ?? 0) + 1;
		await db.insert(studioRevisions).values({
			projectId,
			prompt: `Revisi frame ${frame.name}: ${checked.prompt}`,
			htmlCode,
			version: nextVersion,
		} satisfies InsertStudioRevisionRow);

		await db
			.update(studioProjects)
			.set({ updatedAt: new Date() })
			.where(eq(studioProjects.id, projectId));

		return updated ?? frame;
	} catch (err) {
		const errorMsg =
			err instanceof Error ? err.message : "Gagal merevisi frame";
		const [failed] = await db
			.update(studioFrames)
			.set({ status: "failed", error: errorMsg, updatedAt: new Date() })
			.where(eq(studioFrames.id, frameId))
			.returning();
		return failed ?? frame;
	}
}
