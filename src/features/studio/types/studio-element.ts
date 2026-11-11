import { z } from "zod";

export const STUDIO_ELEMENT_HTML_MAX = 500_000;
export const STUDIO_ELEMENT_FRAGMENT_MAX = 40_000;
export const STUDIO_ELEMENT_COUNT_MAX = 2500;
export const STUDIO_ELEMENT_TIMEOUT_MS = 120_000;
export const STUDIO_ELEMENT_ATTR = "data-studio-element-id";
export const STUDIO_INSPECTION_ATTR = "data-ev-inspect-id";
const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const studioElementBoundsSchema = z.strictObject({
	x: z.number().finite().min(-100_000).max(100_000),
	y: z.number().finite().min(-100_000).max(100_000),
	width: z.number().finite().nonnegative().max(100_000),
	height: z.number().finite().nonnegative().max(100_000),
});
export const studioElementContextSchema = z.strictObject({
	projectId: id,
	frameId: id,
	baseRevision: z.int().nonnegative(),
});
export const studioElementIdentitySchema = studioElementContextSchema.extend({
	baseHash: hash,
	elementId: id,
	selector: z.string().min(1).max(2000),
	tag: z.string().min(1).max(40),
	role: z.string().max(80).nullable(),
	label: z.string().max(120),
	signature: hash,
	parentId: id.nullable(),
});
export const studioElementTargetSchema = studioElementIdentitySchema.extend({
	bounds: studioElementBoundsSchema,
});
export const studioElementEditSchema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("remove") }),
	z.strictObject({ kind: z.literal("text"), text: z.string().max(8000) }),
	z.strictObject({
		kind: z.literal("attribute"),
		name: z.enum(["src", "alt", "title", "aria-label"]),
		value: z.string().max(2000),
	}),
	z.strictObject({
		kind: z.literal("replace"),
		html: z.string().min(1).max(STUDIO_ELEMENT_FRAGMENT_MAX),
	}),
]);
export const studioElementRequestSchema = z.strictObject({
	requestId: z.uuid(),
	target: studioElementTargetSchema,
	prompt: z.string().trim().min(10).max(4000),
	edit: studioElementEditSchema.optional(),
});
export const studioElementPreviewSchema = z.strictObject({
	id: z.uuid(),
	frameId: id,
	frameName: z.string(),
	baseRevision: z.int().nonnegative(),
	baseHash: hash,
	target: studioElementTargetSchema,
	status: z.enum([
		"generating",
		"preview",
		"applied",
		"cancelled",
		"rejected",
		"undone",
	]),
	before: z.string().max(STUDIO_ELEMENT_HTML_MAX),
	after: z.string().max(STUDIO_ELEMENT_HTML_MAX).nullable(),
	summary: z.string(),
	appliedRevision: z.int().nonnegative().nullable(),
});
export type StudioElementContext = z.infer<typeof studioElementContextSchema>;
export type StudioElementIdentity = z.infer<typeof studioElementIdentitySchema>;
export type StudioElementTarget = z.infer<typeof studioElementTargetSchema>;
export type StudioElementEdit = z.infer<typeof studioElementEditSchema>;
export type StudioElementRequest = z.infer<typeof studioElementRequestSchema>;
export type StudioElementPreview = z.infer<typeof studioElementPreviewSchema>;
