/**
 * Atomic write + path-containment helpers for `everythings-vibe export plan`.
 *
 * Every write goes to a temp file in the same directory and is then renamed
 * over the target, so an interrupted export can never leave a half-written
 * planning document behind. Nothing here shells out.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, win32 } from "node:path";

/** Exported plan root, relative to the repository root. */
export const PLAN_EXPORT_DIR_SEGMENTS: readonly string[] = ["docs", "vibeplan"];

/**
 * Windows drive/UNC shape. Mirrors `WINDOWS_ROOT_PATTERN` in `repository.ts`
 * so the standalone CLI package never imports from the web app.
 */
const WINDOWS_ROOT_PATTERN = /^[a-zA-Z]:[\\/]/;

/**
 * A path belongs to Windows path semantics when it carries a drive prefix or a
 * backslash. The flavor is read from the paths themselves rather than from
 * `process.platform` so a root captured on one machine still resolves the same
 * way when it is read back elsewhere (same approach as `getRepositoryName`).
 *
 * Both sides are considered: a relative candidate such as `docs/vibeplan/a.md`
 * carries no Windows marker on its own, yet it must still be resolved with
 * `win32` when the root is `C:\repo` — `posix` would treat the drive prefix as
 * an ordinary segment and reject a legitimate path.
 */
function usesWindowsPaths(value: string): boolean {
	return WINDOWS_ROOT_PATTERN.test(value) || value.includes("\\");
}

/** `join(root, "docs", "vibeplan")` — the only directory the export may touch. */
export function resolvePlanExportRoot(repositoryRoot: string): string {
	return join(repositoryRoot, ...PLAN_EXPORT_DIR_SEGMENTS);
}

/**
 * True when `candidate` resolves to a location strictly inside `root`.
 *
 * Both paths are resolved with one flavor, then compared with `relative`. The
 * result is rejected when it is empty (candidate is the root itself), starts
 * with `..` (traversal), or comes back absolute (a different root). An absolute
 * candidate inside the root is accepted, which is what the export command
 * validates before every write.
 */
export function isPathInsideRoot(root: string, candidate: string): boolean {
	if (root.length === 0 || candidate.length === 0) return false;

	// Windows semantics win when either side carries a drive prefix or a
	// backslash: a POSIX-flavored `relative` would read `C:` as a plain segment
	// and could accept a path that actually points at another root.
	const flavor =
		usesWindowsPaths(root) || usesWindowsPaths(candidate) ? win32 : posix;
	const resolvedRoot = flavor.resolve(root);
	const resolvedCandidate = flavor.resolve(resolvedRoot, candidate);
	const rel = flavor.relative(resolvedRoot, resolvedCandidate);

	if (rel.length === 0) return false;
	if (rel.startsWith("..")) return false;
	return !flavor.isAbsolute(rel);
}

/** Create `dirPath` (and its parents) if missing. Existing directories are fine. */
export async function ensureDirectory(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true });
}

/**
 * Write `content` to `filePath` atomically: same-directory temp file, then
 * `rename` over the target. Any failure unlinks the temp file and rethrows, so
 * the previous content of `filePath` stays intact.
 *
 * Same technique as `saveConfig` in `config.ts`, minus the credential mode.
 */
export async function writeFileAtomic(
	filePath: string,
	content: string,
): Promise<void> {
	const tempFile = join(
		dirname(filePath),
		`.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
	);

	try {
		await writeFile(tempFile, content, { encoding: "utf-8" });
		await rename(tempFile, filePath);
	} catch (err) {
		try {
			await unlink(tempFile);
		} catch {
			// The temp file may never have been created; the real error follows.
		}
		throw new Error(
			`Cannot write "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err },
		);
	}
}

/** Narrow a thrown value to a Node errno code without a type assertion. */
function errnoCode(err: unknown): string | null {
	if (typeof err !== "object" || err === null || !("code" in err)) return null;
	const code: unknown = err.code;
	return typeof code === "string" ? code : null;
}

/** Read `filePath` as UTF-8, or `null` when it does not exist. */
export async function readFileIfExists(
	filePath: string,
): Promise<string | null> {
	try {
		return await readFile(filePath, "utf-8");
	} catch (err) {
		if (errnoCode(err) === "ENOENT") return null;
		throw err;
	}
}
