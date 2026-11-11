import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioRevisionRow,
	type StudioRevisionRow,
	studioProjects,
	studioRevisions,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { generateValidatedFrameHtml } from "./studio-frame-generation";
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
	const productBrief = detail.revisions.at(-1)?.prompt ?? detail.title;
	const revisionRequest = `Original product brief: ${productBrief}\nRequested change: ${checked.prompt}`;
	const userPrompt = buildStudioUserPrompt(revisionRequest, {
		previousHtml,
		designMode,
		designMd: detail.designMd,
		logoUrl: detail.logoUrl,
		prdContent: detail.prdContent,
	});

	const dsTokens = extractDesignSystemTokens(detail.designMd);
	const htmlCode = await generateValidatedFrameHtml({
		framePrompt: userPrompt,
		blueprint: null,
		viewport: designMode,
		expectTokens: dsTokens !== null,
		dsTokens,
		logoUrl: detail.logoUrl,
		contentContext: { brief: revisionRequest, prdContent: detail.prdContent },
	});
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
