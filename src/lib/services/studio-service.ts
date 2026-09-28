import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioProjectRow,
	type InsertStudioRevisionRow,
	type StudioProjectRow,
	type StudioRevisionRow,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { extractCleanHtml } from "@/lib/clean-html";
import { ScrapeError } from "@/lib/design-errors";
import {
	buildStudioUserPrompt,
	STUDIO_SYSTEM_PROMPT,
	validateStudioPrompt,
} from "@/lib/prompts-ui-studio";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";

export interface StudioProjectDetail extends StudioProjectRow {
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
}

export async function createStudioProject(
	userId: string,
	title: string,
	prompt: string,
): Promise<{ project: StudioProjectRow; revision: StudioRevisionRow }> {
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const cleanTitle = title.trim().slice(0, 200) || "Studio tanpa judul";
	const htmlCode = await generateStudioHtml(prompt);
	const [project] = await db
		.insert(studioProjects)
		.values({
			userId,
			title: cleanTitle,
		} satisfies InsertStudioProjectRow)
		.returning();
	if (!project) throw new ScrapeError("STORAGE_FAILED");
	const [revision] = await db
		.insert(studioRevisions)
		.values({
			projectId: project.id,
			prompt: checked.prompt,
			htmlCode,
			version: 1,
		} satisfies InsertStudioRevisionRow)
		.returning();
	if (!revision) throw new ScrapeError("STORAGE_FAILED");
	return { project, revision };
}

export async function reviseStudioProject(
	projectId: string,
	userId: string,
	prompt: string,
): Promise<StudioRevisionRow> {
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const detail = await getStudioProject(projectId, userId);
	const previousHtml = detail.latest?.htmlCode;
	const htmlCode = await generateStudioHtml(
		buildStudioUserPrompt(checked.prompt, previousHtml),
	);
	const nextVersion = (detail.latest?.version ?? 0) + 1;
	const [revision] = await db
		.insert(studioRevisions)
		.values({
			projectId,
			prompt: checked.prompt,
			htmlCode,
			version: nextVersion,
		} satisfies InsertStudioRevisionRow)
		.returning();
	if (!revision) throw new ScrapeError("STORAGE_FAILED");
	return revision;
}

export async function getStudioProject(
	projectId: string,
	userId: string,
): Promise<StudioProjectDetail> {
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(eq(studioProjects.id, projectId), eq(studioProjects.userId, userId)),
		)
		.limit(1);
	if (!project)
		throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
	const revisions = await db
		.select()
		.from(studioRevisions)
		.where(eq(studioRevisions.projectId, projectId))
		.orderBy(desc(studioRevisions.version));
	return { ...project, revisions, latest: revisions[0] ?? null };
}

export async function listStudioProjects(
	userId: string,
	limit = 50,
): Promise<StudioProjectRow[]> {
	return db
		.select()
		.from(studioProjects)
		.where(eq(studioProjects.userId, userId))
		.orderBy(desc(studioProjects.updatedAt))
		.limit(limit);
}

export async function generateStudioHtml(
	prompt: string,
	maxTokens = 12_000,
): Promise<string> {
	const { generator, firstChunk } = await tryStreamWithFallback(
		selectModels(),
		[
			{ role: "system", content: STUDIO_SYSTEM_PROMPT },
			{ role: "user", content: prompt },
		],
		undefined,
		maxTokens,
	);
	let raw = firstChunk;
	for await (const chunk of generator) raw += chunk;
	const cleaned = extractCleanHtml(raw);
	if (cleaned.trim().length === 0)
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"Studio gagal menghasilkan HTML.",
		);
	return cleaned;
}
