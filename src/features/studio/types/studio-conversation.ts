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
	deferred: z.array(z.string()).optional(),
	/** Which kind of request this turn answers; absent on rows written before P4. */
	kind: z.enum(["initial", "add", "revise"]).optional(),
	/** Screens whose frames or jobs genuinely failed, so partial results can name them. */
	failedScreens: z.array(z.string()).optional(),
	recovery: z.enum(["planning", "frames", "resubmit"]).nullable(),
});
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
