import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserServer } from "@/lib/session";
import type { StudioPrototypeLoaderData } from "../types/studio-prototype";

const inputSchema = z.object({ projectId: z.string().min(1).max(200) });

/**
 * Lean, ownership-checked read for the viewer shell: names and routes only, no
 * HTML, chat or revision history. An unowned or missing project is reported as
 * not found, never as "exists but forbidden".
 */
export const loadStudioPrototype = createServerFn({ method: "GET" })
	.validator((input: unknown) => inputSchema.parse(input))
	.handler(async ({ data }): Promise<StudioPrototypeLoaderData> => {
		const user = await requireUserServer();
		const { readStudioPrototypeShell } = await import(
			"./studio-prototype-shell"
		);
		return readStudioPrototypeShell(data.projectId, user.id);
	});
