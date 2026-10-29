import { CODEBASE_GENERATION_MAX_CONTEXT_CHARS } from "../types/codebase-constants";

export function revisionReferencesFit(
	paths: readonly string[],
	entries: readonly { path: string; size: number }[],
): boolean {
	return (
		paths.reduce(
			(total, path) =>
				total + (entries.find((entry) => entry.path === path)?.size ?? 0),
			0,
		) <= CODEBASE_GENERATION_MAX_CONTEXT_CHARS
	);
}
