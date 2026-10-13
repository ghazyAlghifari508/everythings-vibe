import { z } from "zod";
import { STUDIO_DESIGN_MD_MAX_CHARS } from "./constants";

export const STUDIO_DEFAULT_PAGE_COUNT = 3;
export const STUDIO_MIN_PAGE_COUNT = 1;
export const STUDIO_MAX_PAGE_COUNT = 5;
export const STUDIO_DESIGN_FILE_MAX_BYTES = 500 * 1024;
export const studioDesignSkillIdSchema = z.enum([
	"none",
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
]);
export type StudioDesignSkillId = z.infer<typeof studioDesignSkillIdSchema>;
export const studioInitialPageCountSchema = z
	.number()
	.int()
	.min(STUDIO_MIN_PAGE_COUNT)
	.max(STUDIO_MAX_PAGE_COUNT);
export const studioDesignFilenameSchema = z
	.string()
	.trim()
	.min(1)
	.max(255)
	.regex(/^[^/\\]+\.(md|markdown)$/i, "Gunakan nama file .md atau .markdown.")
	.refine(
		(filename) =>
			[...filename].every((character) => character.charCodeAt(0) >= 32),
		"Nama file tidak valid.",
	);
export const studioDesignReferenceSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("theme"), id: z.string().trim().min(1).max(100) }),
	z.object({ kind: z.literal("custom"), filename: studioDesignFilenameSchema }),
]);
export type StudioDesignReference = z.infer<typeof studioDesignReferenceSchema>;
export const studioDesignReferenceMetadataSchema = z.discriminatedUnion(
	"kind",
	[
		z.object({
			kind: z.literal("theme"),
			id: z.string().min(1),
			source: z.literal("studio-presets"),
			version: z.number().int().positive(),
		}),
		z.object({
			kind: z.literal("custom"),
			id: z.string().min(1),
			source: z.literal("upload"),
			version: z.literal(1),
			filename: studioDesignFilenameSchema,
		}),
	],
);
export type StudioDesignReferenceMetadata = z.infer<
	typeof studioDesignReferenceMetadataSchema
>;
export const studioGenerationOptionsSchema = z.object({
	designSkillId: studioDesignSkillIdSchema.default("none"),
	initialPageCount: studioInitialPageCountSchema.default(
		STUDIO_DEFAULT_PAGE_COUNT,
	),
	designMode: z.enum(["web", "mobile"]).default("web"),
	designReference: studioDesignReferenceSchema.nullable().optional(),
	designMd: z.string().max(STUDIO_DESIGN_MD_MAX_CHARS).nullable().optional(),
});
export type StudioGenerationOptions = z.infer<
	typeof studioGenerationOptionsSchema
>;
