import { z } from "zod";

/** `POST /api/export/prd` response, parsed before it is folded into the AI-agent
 * handoff prompt so a malformed artifact cannot paste `undefined` into the
 * contract the external agent follows. */
export const projectExportPayloadSchema = z.object({
	projectName: z.string().default(""),
	prd: z.string().nullable(),
	ac: z.string().nullable(),
	tasks: z.string().nullable(),
});

export type ProjectExportPayload = z.infer<typeof projectExportPayloadSchema>;
