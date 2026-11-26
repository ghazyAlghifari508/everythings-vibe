import { z } from "zod";
import { studioElementTargetSchema } from "./studio-element";

export const studioMessageStatusSchema = z.enum([
	"accepted",
	"queued",
	"planning",
	"generating",
	"completed",
	"partial",
	"failed",
]);
export const studioMessageAttachmentSchema = z.object({
	frameId: z.string().min(1),
	name: z.string(),
	target: studioElementTargetSchema.optional(),
});
/** Bounded text observed in a frame's committed markup. Never model-authored prose. */
export const studioFrameFactsSchema = z.object({
	headings: z.array(z.string().max(120)).max(6),
	navigation: z.array(z.string().max(80)).max(8),
	actions: z.array(z.string().max(80)).max(6),
	fields: z.array(z.string().max(80)).max(6),
	forms: z.int().nonnegative().max(99),
	tables: z.int().nonnegative().max(99),
});
/**
 * What a revision changed, from comparing both committed revisions. `identical`
 * and `markup` (same observed text, different markup) are distinct from `text`.
 */
export const studioFrameChangesSchema = z.object({
	kind: z.enum(["text", "markup", "identical"]),
	added: z.array(z.string().max(120)).max(6),
	removed: z.array(z.string().max(120)).max(6),
});
/** One frame this operation produced or targeted, scoped to the operation's own jobs. */
export const studioMessageFrameSchema = z.object({
	frameId: z.string().min(1),
	name: z.string(),
	viewport: z.enum(["web", "mobile"]),
	status: z.enum(["ready", "failed", "pending"]),
	revision: z.int().nonnegative(),
	facts: studioFrameFactsSchema.optional(),
	changes: studioFrameChangesSchema.optional(),
});
export const studioMessageProgressSchema = z.object({
	phase: z.enum([
		"queued",
		"planning",
		"generating",
		"completed",
		"partial",
		"failed",
	]),
	ready: z.int().nonnegative(),
	total: z.int().nonnegative(),
	failed: z.int().nonnegative(),
	screenNames: z.array(z.string()),
	/** Real frame results of this operation; absent on rows written before P11 Fix 04. */
	frames: z.array(studioMessageFrameSchema).max(100).optional(),
	deferred: z.array(z.string()).optional(),
	/** Which kind of request this turn answers; absent on rows written before P4. */
	kind: z.enum(["initial", "add", "revise"]).optional(),
	/** Screens whose frames or jobs genuinely failed, so partial results can name them. */
	failedScreens: z.array(z.string()).optional(),
	recovery: z.enum(["planning", "frames", "resubmit"]).nullable(),
});
export type StudioFrameFacts = z.infer<typeof studioFrameFactsSchema>;
export type StudioFrameChanges = z.infer<typeof studioFrameChangesSchema>;
export type StudioMessageFrame = z.infer<typeof studioMessageFrameSchema>;
export type StudioMessageStatus = z.infer<typeof studioMessageStatusSchema>;
export type StudioMessageAttachment = z.infer<
	typeof studioMessageAttachmentSchema
>;
export type StudioMessageProgress = z.infer<typeof studioMessageProgressSchema>;
const date = z.union([
	z.date(),
	z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
]);
export const studioMessageSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	userId: z.string().min(1),
	operationId: z.string().min(1),
	jobIds: z.array(z.string().min(1)),
	role: z.enum(["user", "assistant"]),
	content: z.string(),
	order: z.int().nonnegative(),
	status: studioMessageStatusSchema,
	attachments: z.array(studioMessageAttachmentSchema),
	progress: studioMessageProgressSchema.nullable(),
	createdAt: date,
	updatedAt: date,
});
