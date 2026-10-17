/**
 * Persistence for the repository explorer's folder expansion.
 *
 * Only folder paths are stored — never file contents. The payload is scoped per
 * codebase so two repositories never share preferences, and every stored value
 * is treated as untrusted input: a corrupted or hand-edited entry is ignored
 * rather than allowed to break the tree.
 */

/** Upper bound on stored paths, so a pathological payload cannot grow forever. */
export const EXPLORER_EXPANSION_MAX_ENTRIES = 500;

const STORAGE_PREFIX = "codebase-explorer-expansion";

interface FolderPathNode {
	fullPath: string;
	isFile: boolean;
	children: readonly FolderPathNode[];
}

/**
 * Storage key for one codebase's expansion state, or null when there is no
 * codebase to scope it to. The key is delimited so one id can never be a prefix
 * of another's.
 */
export function explorerExpansionStorageKey(codebaseId: string): string | null {
	const trimmed = codebaseId.trim();
	if (!trimmed) return null;
	return `${STORAGE_PREFIX}:${trimmed}`;
}

/**
 * A stored path must be a repository-relative folder path: no leading slash, no
 * drive letters, no `..` segment. Anything else was never produced by the
 * explorer and is dropped on read.
 */
function isStorableFolderPath(value: string): boolean {
	if (!value || value.length > 512) return false;
	if (value.startsWith("/") || value.startsWith("\\")) return false;
	if (value.includes("\\")) return false;
	if (/^[a-zA-Z]:/.test(value)) return false;
	return !value
		.split("/")
		.some((segment) => segment === ".." || segment === "");
}

/**
 * Read a stored expansion preference. Any unreadable, mistyped, oversized, or
 * malformed value yields "nothing expanded", which is also the first-visit
 * default.
 */
export function parseExplorerExpansion(
	raw: string | null | undefined,
): string[] {
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const seen = new Set<string>();
	const paths: string[] = [];
	for (const entry of parsed) {
		if (typeof entry !== "string") continue;
		if (!isStorableFolderPath(entry)) continue;
		if (seen.has(entry)) continue;
		seen.add(entry);
		paths.push(entry);
		if (paths.length >= EXPLORER_EXPANSION_MAX_ENTRIES) break;
	}
	return paths;
}

/** Encode the expansion preference for storage, applying the same bounds. */
export function serializeExplorerExpansion(paths: Iterable<string>): string {
	const encoded: string[] = [];
	for (const path of paths) {
		if (encoded.length >= EXPLORER_EXPANSION_MAX_ENTRIES) break;
		encoded.push(path);
	}
	return JSON.stringify(encoded);
}

/**
 * Keep only folder paths the current tree still has. Stale paths from an older
 * snapshot are dropped rather than carried forward.
 */
export function pruneExplorerExpansion(
	paths: readonly string[],
	availableFolders: ReadonlySet<string>,
): string[] {
	const seen = new Set<string>();
	const kept: string[] = [];
	for (const path of paths) {
		if (seen.has(path)) continue;
		if (!availableFolders.has(path)) continue;
		seen.add(path);
		kept.push(path);
		if (kept.length >= EXPLORER_EXPANSION_MAX_ENTRIES) break;
	}
	return kept;
}

/** Every folder path in a built explorer tree, at any depth. */
export function collectFolderPaths<T extends FolderPathNode>(
	nodes: readonly T[],
): Set<string> {
	const folders = new Set<string>();
	const walk = (list: readonly FolderPathNode[]) => {
		for (const node of list) {
			if (!node.isFile) folders.add(node.fullPath);
			if (node.children.length > 0) walk(node.children);
		}
	};
	walk(nodes);
	return folders;
}
