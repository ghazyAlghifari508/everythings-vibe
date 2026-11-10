import { z } from "zod";
import { codebaseSyncStatusSchema } from "../types/sync-schemas";

export const codebaseSessionRequestSchema = z
	.object({
		action: z.enum(["retry", "recover", "resync"]).optional(),
		sessionId: z.string().min(1).optional(),
		requestId: z.uuid().optional(),
	})
	.refine((body) => body.action !== "resync" || Boolean(body.requestId))
	.refine((body) => body.action !== "retry" || Boolean(body.sessionId));

export const restoredSyncSessionSchema = z.object({
	projectId: z.string().min(1),
	sessionId: z.string().min(1),
	status: codebaseSyncStatusSchema,
	expiresAt: z.string().datetime(),
});

export const syncSessionErrorSchema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	sessionId: z.string().optional(),
});
