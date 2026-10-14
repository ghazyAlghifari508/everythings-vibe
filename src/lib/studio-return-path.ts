import { z } from "zod";

export const STUDIO_RETURN_FALLBACK = "/design";

const STUDIO_RETURN_PATH = z.enum([STUDIO_RETURN_FALLBACK, "/design/studio"]);

export const studioReturnSearchSchema = z.object({
	from: STUDIO_RETURN_PATH.default(STUDIO_RETURN_FALLBACK),
});

export type StudioReturnSearch = z.infer<typeof studioReturnSearchSchema>;

export function parseStudioReturnSearch(search: unknown): StudioReturnSearch {
	const parsed = studioReturnSearchSchema.safeParse(search);
	return parsed.success ? parsed.data : { from: STUDIO_RETURN_FALLBACK };
}

export function resolveStudioReturnPath(from: unknown): string {
	return parseStudioReturnSearch({ from }).from;
}
