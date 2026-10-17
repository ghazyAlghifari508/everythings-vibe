import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioRevisionRow,
	type StudioRevisionRow,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { generateStudioHtml } from "./studio-frame-generation";
import { getStudioProject } from "./studio-project-query";
import {
	validateStudioDesignMode,
	validateStudioPrompt,
} from "./studio-prompt-validation";
import { buildStudioUserPrompt } from "./studio-screen-prompts";

export async function reviseStudioProject(
	projectId: string,
	userId: string,
	prompt: string,
): Promise<StudioRevisionRow> {
	const checked = validateStudioPrompt(prompt);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	const detail = await getStudioProject(projectId, userId);

	const previousHtml = detail.latest?.htmlCode;
	const designMode = validateStudioDesignMode(detail.designMode);
	const userPrompt = buildStudioUserPrompt(checked.prompt, {
		previousHtml,
		designMode,
		designMd: detail.designMd,
		logoUrl: detail.logoUrl,
		prdContent: detail.prdContent,
	});

	const htmlCode = await generateStudioHtml(
		userPrompt,
		undefined,
		detail.designSkillId,
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

	await db
		.update(studioProjects)
		.set({ updatedAt: new Date() })
		.where(eq(studioProjects.id, projectId));

	return revision;
}
