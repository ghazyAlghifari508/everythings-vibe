import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertStudioAssetRow,
	type StudioProjectRow,
	studioAssets,
	studioFrames,
	studioJobs,
	studioProjects,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioPreferencesInput } from "../types/studio-service";
import { resolveStudioDesignReference } from "./studio-design-reference.server";
import { resolveStudioDesignSkill } from "./studio-design-skill-registry.server";
import { enforceDesignSystemOnHtml } from "./studio-design-system-html";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import { studioGenerationOptionsSchema } from "./studio-generation-options";
import {
	buildStudioAssetUrl,
	validateAndProcessLogo,
} from "./studio-logo-service";
import { enqueueStudioOperation } from "./studio-operation-enqueue";

export async function updateStudioDesignSystem(
	projectId: string,
	userId: string,
	input: StudioPreferencesInput,
): Promise<StudioProjectRow> {
	return updateStudioPreferences(projectId, userId, input);
}

export async function updateStudioPreferences(
	projectId: string,
	userId: string,
	input: StudioPreferencesInput,
): Promise<StudioProjectRow> {
	const hasReference =
		input.designReference !== undefined || input.designMd !== undefined;
	const resolved = hasReference
		? await resolveStudioDesignReference(
				input.designReference,
				input.designMd,
				userId,
			)
		: undefined;
	const skillId =
		input.designSkillId === undefined
			? undefined
			: studioGenerationOptionsSchema.parse({
					designSkillId: input.designSkillId,
				}).designSkillId;
	const validatedLogo = input.logo ? validateAndProcessLogo(input.logo) : null;
	const updatedProject = await db.transaction(async (tx) => {
		const [project] = await tx
			.select()
			.from(studioProjects)
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.for("update");
		if (!project)
			throw new ScrapeError("WEBSITE_BLOCKED", "Studio tidak ditemukan.");
		const [busy] = await tx
			.select()
			.from(studioJobs)
			.where(
				and(
					eq(studioJobs.projectId, projectId),
					eq(studioJobs.userId, userId),
					inArray(studioJobs.status, ["queued", "planning", "generating"]),
				),
			)
			.limit(1);
		if (busy)
			throw new ScrapeError(
				"INVALID_URL",
				"Tunggu proses desain selesai sebelum mengganti design system.",
			);
		let logoAssetId = project.logoAssetId;
		if (validatedLogo) {
			const [asset] = await tx
				.insert(studioAssets)
				.values({
					userId,
					projectId,
					...validatedLogo,
				} satisfies InsertStudioAssetRow)
				.returning();
			if (!asset) throw new ScrapeError("STORAGE_FAILED");
			logoAssetId = asset.id;
		} else if (input.logo === null) {
			logoAssetId = null;
		}
		const logoUrl = logoAssetId
			? buildStudioAssetUrl(logoAssetId, userId)
			: null;
		const designMd = resolved ? resolved.designMd : project.designMd;
		const tokens = extractDesignSystemTokens(designMd);
		const frames = await tx
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, projectId));
		for (const frame of frames) {
			if (!hasReference && input.logo === undefined) continue;
			if (!frame.htmlCode) continue;
			let htmlCode = frame.htmlCode;
			if (input.logo !== undefined && project.logoAssetId) {
				htmlCode = htmlCode.replace(
					/<img\b[^>]*src=["'](\/api\/studio\/asset\?[^"']+)["'][^>]*>/gi,
					(tag, url: string) => {
						const id = new URL(
							url.replaceAll("&amp;", "&"),
							"https://studio.invalid",
						).searchParams.get("id");
						return id === project.logoAssetId
							? logoUrl
								? tag.replace(url, logoUrl)
								: ""
							: tag;
					},
				);
			}
			htmlCode = enforceDesignSystemOnHtml(
				htmlCode,
				tokens,
				logoUrl,
				project.designBlueprint,
			);
			await tx
				.update(studioFrames)
				.set({ htmlCode, updatedAt: new Date() })
				.where(
					and(
						eq(studioFrames.id, frame.id),
						eq(studioFrames.projectId, projectId),
					),
				);
		}
		const [updated] = await tx
			.update(studioProjects)
			.set({
				designMd,
				logoAssetId,
				...(resolved ? { designReference: resolved.designReference } : {}),
				...(skillId !== undefined ? { designSkillId: skillId } : {}),
				...(resolved &&
				(resolved.designMd !== project.designMd ||
					JSON.stringify(resolved.designReference ?? null) !==
						JSON.stringify(project.designReference ?? null))
					? {
							designBlueprintVersion: sql`${studioProjects.designBlueprintVersion} + 1`,
						}
					: {}),
				...(skillId !== undefined && skillId !== project.designSkillId
					? { designSkillVersion: resolveStudioDesignSkill(skillId).version }
					: {}),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(studioProjects.id, projectId),
					eq(studioProjects.userId, userId),
				),
			)
			.returning();
		if (!updated) throw new ScrapeError("STORAGE_FAILED");
		return updated;
	});
	const targets = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, projectId));
	if (
		(hasReference || input.logo !== undefined) &&
		targets.some((frame) => frame.status === "ready")
	) {
		await enqueueStudioOperation(projectId, userId, {
			action: "revise",
			frameIds: targets
				.filter((frame) => frame.status === "ready")
				.map((frame) => frame.id),
			requestId: crypto.randomUUID(),
			prompt:
				"Apply the active DESIGN.md design system to this screen: typography, colors, spacing, radius, surfaces, component styling and elevation. Preserve its content and screen identity.",
		});
	}
	return updatedProject;
}
