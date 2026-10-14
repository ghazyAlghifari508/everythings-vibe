/**
 * Repository scanner for codebase sync.
 *
 * Walks the repository without following symlinks, normalizes every path to
 * a safe repository-relative `/`-separated form, applies built-in exclusions
 * plus custom ignore rules, and returns exclusion metadata without
 * file contents. Source content loading happens later in `manifest.ts`.
 */

import {
	lstat,
	open,
	readdir,
	readFile,
	realpath,
	stat,
} from "node:fs/promises";
import {
	dirname,
	isAbsolute,
	join,
	parse,
	posix,
	relative,
	resolve,
	sep,
	win32,
} from "node:path";
import {
	type IgnoreRules,
	isBuiltInExcluded,
	matchesCustomIgnore,
} from "./ignore.js";

/**
 * Resolve the repository root for a sync run.
 *
 * An explicit `--root` always wins. Otherwise walk up from `startDir` to the
 * nearest ancestor containing a `.git` entry, so an agent launched from a
 * subdirectory still scans the whole repository. A `.git` file counts as a
 * match, not only a directory, so git worktrees and submodules resolve.
 * Without any marker the start directory is kept, matching prior behavior.
 *
 * Walks the filesystem directly rather than shelling out to git: that keeps
 * this deterministic and free of new failure modes (git absent, not on PATH,
 * output encoding).
 */
export async function resolveRepositoryRoot(
	startDir: string,
	explicitRoot?: string,
): Promise<string> {
	if (explicitRoot) return resolve(explicitRoot);

	let current = resolve(startDir);
	const { root: filesystemRoot } = parse(current);
	while (true) {
		try {
			await lstat(join(current, ".git"));
			return current;
		} catch (err) {
			if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
		}
		if (current === filesystemRoot) return resolve(startDir);
		const parent = dirname(current);
		if (parent === current) return resolve(startDir);
		current = parent;
	}
}

export interface ScannedFile {
	/** Safe repository-relative path with `/` separators. */
	path: string;
	/** File size in bytes at scan time. */
	size: number;
}

export interface ExcludedEntry {
	/** Safe repository-relative path with `/` separators. */
	path: string;
	/** Exclusion category (never contains file contents or secrets). */
	reason: string;
}

export interface RepositoryScan {
	/** Absolute repository root used for content loading (never uploaded). */
	root: string;
	/** Included files, sorted by path. */
	files: ScannedFile[];
	/** Excluded paths with reasons, sorted by path. */
	excluded: ExcludedEntry[];
}

const WINDOWS_ROOT_PATTERN = /^[a-zA-Z]:[\\/]/;
/**
 * Control-character guard duplicated from the web app
 * (`src/lib/codebase-sync.ts`) so the standalone CLI package never imports from
 * `src/`. A repository name is a single path segment, so C0 controls and DEL are
 * rejected outright. Expressed over code points, so the pattern carries no
 * control-character literal.
 */
function hasControlCharacters(value: string): boolean {
	return [...value].some((ch) => {
		const code = ch.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
}

/**
 * The one rule for a value that will leave this machine as a repository name:
 * it must be a single path segment with no control characters.
 *
 * Kept canonical here so both the derivation (`getRepositoryName`) and the
 * transport (`sync-client`) enforce the same shape instead of each trusting the
 * other. The server validates the same boundary independently, since a sync
 * request can come from any client, not only this package.
 */
export function isSafeRepositoryName(candidate: string): boolean {
	if (typeof candidate !== "string") return false;
	if (candidate.trim().length === 0) return false;
	if (hasControlCharacters(candidate)) return false;
	return isSafeRelativePath(candidate);
}

/**
 * Derive the repository's display name from a resolved repository root.
 *
 * Returns the folder's basename only — never a parent segment and never the
 * root itself — so the value is safe to put in an API payload. The absolute
 * root stays local (human output only); this is the single piece of repository
 * identity the CLI is allowed to disclose.
 *
 * The path flavor is chosen from the root's own shape rather than from
 * `process.platform`, so an `--root` captured on one machine still derives the
 * same name when it is read back elsewhere. An unusable root returns `null`
 * rather than a guess.
 */
export function getRepositoryName(root: string): string | null {
	if (typeof root !== "string" || root.trim().length === 0) return null;
	const flavor =
		WINDOWS_ROOT_PATTERN.test(root) || root.includes("\\") ? win32 : posix;
	const candidate = flavor.basename(root).trim();
	if (!isSafeRepositoryName(candidate)) return null;
	return candidate;
}

export function humanizeRepositoryName(value: string): string | null {
	const words = value
		.replace(/[._-]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (words.length === 0) return null;
	return words
		.map((word) => {
			const first = [...word][0];
			return first
				? `${first.toLocaleUpperCase()}${word.slice(first.length)}`
				: "";
		})
		.join(" ");
}

/** Credentials embedded in a remote URL: `scheme://user:token@host/...`. */
const URL_USERINFO_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^/@]+@/i;
/** Scp-style remote with a username: `git@host:owner/repo.git`. */
const SCP_LIKE_PATTERN = /^[^/@\s]+@([^/:\s]+):(.+)$/;
/** `scheme://host/path` — the shape that survives normalization. */
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/(.+)$/i;
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\//i;
/** A Windows drive or UNC prefix, which is a local path, never a remote. */
const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:[\\/]|^\\\\/;
const TRAILING_SLASHES_PATTERN = /\/+$/;
const GIT_SUFFIX_PATTERN = /\.git$/i;
/**
 * Transport markers that are never a repository's own name: `_git` is Azure
 * DevOps' separator, `scm` is Bitbucket Server's. Generic words like `git` are
 * deliberately kept, since they are legitimate group names on self-hosted hosts
 * and stripping them could merge two different repositories.
 */
const NON_IDENTITY_SEGMENTS = new Set(["_git", "scm"]);

/**
 * Normalize a Git remote URL into a stable repository identity, or `null` when
 * it cannot be verified.
 *
 * Mirrors `normalizeRepositoryIdentity` in the web app (`src/lib/codebase-repository-identity.ts`)
 * so the standalone CLI package never imports from `src/`. The result is
 * `host/owner/repo` in lowercase with `.git`, trailing slashes, ports,
 * credentials, and query strings removed. Credentials can never survive: any
 * userinfo is dropped before the value is built. Callers must treat `null` as
 * "identity unknown" and never fall back to comparing folder names.
 */
export function normalizeRepositoryIdentity(
	remoteUrl: string | null | undefined,
): string | null {
	if (typeof remoteUrl !== "string") return null;
	const trimmed = remoteUrl.trim();
	if (!trimmed) return null;
	if (WINDOWS_PATH_PATTERN.test(trimmed)) return null;
	if (trimmed.startsWith("/") || trimmed.startsWith("./")) return null;
	if (URL_USERINFO_PATTERN.test(trimmed) && !SCP_LIKE_PATTERN.test(trimmed)) {
		const scheme = SCHEME_PATTERN.exec(trimmed)?.[1] ?? "https";
		return normalizeRepositoryIdentity(
			`${scheme}://${trimmed.slice(trimmed.indexOf("@") + 1)}`,
		);
	}

	const scpLike = SCP_LIKE_PATTERN.exec(trimmed);
	const split = scpLike
		? { host: scpLike[1], path: scpLike[2] }
		: (() => {
				const withoutScheme = URL_LIKE_PATTERN.exec(trimmed);
				if (!withoutScheme) return null;
				const rest = withoutScheme[1];
				const slashIndex = rest.indexOf("/");
				if (slashIndex === -1) return null;
				const authority = rest.slice(0, slashIndex);
				const hostWithPort = authority.includes("@")
					? authority.slice(authority.lastIndexOf("@") + 1)
					: authority;
				const host = hostWithPort.includes(":")
					? hostWithPort.slice(0, hostWithPort.lastIndexOf(":"))
					: hostWithPort;
				if (!host) return null;
				return { host, path: rest.slice(slashIndex + 1) };
			})();
	if (!split) return null;

	const path = split.path
		.split(/[?#]/)[0]
		.replace(TRAILING_SLASHES_PATTERN, "")
		.replace(GIT_SUFFIX_PATTERN, "")
		.replace(TRAILING_SLASHES_PATTERN, "");
	const segments = path
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
		.filter((segment) => !NON_IDENTITY_SEGMENTS.has(segment.toLowerCase()));
	if (segments.length === 0) return null;
	return [
		split.host.toLowerCase(),
		...segments.map((s) => s.toLowerCase()),
	].join("/");
}

/**
 * Read `remote.origin.url` from a repository's Git config, or `null` when the
 * repository has no origin remote or no readable config.
 *
 * The config is parsed directly instead of shelling out to git: no PATH
 * dependency, no encoding surprises, and no subprocess to fail halfway. A `.git`
 * *file* (worktree or submodule) is followed through its `gitdir:` pointer so a
 * linked checkout still reports the same identity as its main repository.
 *
 * Only the remote URL is read. Nothing else from the config — credentials
 * helpers, user identity, or local paths — is parsed or transmitted.
 */
export async function readRepositoryIdentity(
	root: string,
): Promise<string | null> {
	if (typeof root !== "string" || root.trim().length === 0) return null;
	const gitEntry = join(root, ".git");
	let configPath: string;
	try {
		const entryStat = await lstat(gitEntry);
		if (entryStat.isDirectory()) {
			configPath = join(gitEntry, "config");
		} else {
			const pointer = await readFile(gitEntry, "utf-8");
			const match = /^gitdir:\s*(.+)$/m.exec(pointer);
			const target = match?.[1]?.trim();
			if (!target) return null;
			const gitDir = isAbsolute(target) ? target : resolve(root, target);
			configPath = join(gitDir, "config");
		}
	} catch {
		return null;
	}

	let config: string;
	try {
		config = await readFile(configPath, "utf-8");
	} catch {
		return null;
	}

	// `[remote "origin"]` followed by its `url = ...` line. Parsing the section
	// rather than grepping for `url` keeps an unrelated remote's URL out.
	const lines = config.split(/\r?\n/);
	let inOrigin = false;
	for (const line of lines) {
		const trimmed = line.trim();
		const section = /^\[remote\s+"(.+)"\]$/i.exec(trimmed);
		if (section) {
			inOrigin = section[1] === "origin";
			continue;
		}
		if (!inOrigin) continue;
		const assignment = /^url\s*=\s*(.+)$/i.exec(trimmed);
		if (assignment) return normalizeRepositoryIdentity(assignment[1]);
	}
	return null;
}

/**
 * Guard duplicated from the web app (`src/lib/codebase-sync.ts`) so the
 * standalone CLI package never imports from `src/`. Normalizes backslashes
 * first, then rejects absolute/drive/UNC paths, empty segments, and `..`.
 */
export function isSafeRelativePath(path: string): boolean {
	if (!path || path.length === 0) return false;
	if (path.includes("\0")) return false;
	const normalized = path.replace(/\\/g, "/");
	if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
		return false;
	}
	const segments = normalized.split("/");
	for (const segment of segments) {
		if (segment === "" || segment === "." || segment === "..") return false;
	}
	return true;
}

function toNormalizedRelative(
	root: string,
	absolutePath: string,
): string | null {
	const rel = relative(root, absolutePath);
	if (rel === "" || isAbsolute(rel)) return null;
	const normalized = rel.split(sep).join("/");
	if (!isSafeRelativePath(normalized)) return null;
	return normalized;
}

function isWithinRoot(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export async function scanRepository(
	root: string,
	rules: IgnoreRules,
): Promise<RepositoryScan> {
	const resolvedRoot = await realpath(resolve(root)).catch(() => resolve(root));
	const rootStat = await stat(resolvedRoot).catch((err) => {
		throw new Error(
			`Cannot scan repository root: ${err instanceof Error ? err.message : String(err)}`,
		);
	});
	if (!rootStat.isDirectory()) {
		throw new Error("Repository root is not a directory");
	}

	const files: ScannedFile[] = [];
	const excluded: ExcludedEntry[] = [];

	async function visit(absolutePath: string): Promise<void> {
		let entryStat: Awaited<ReturnType<typeof lstat>>;
		try {
			entryStat = await lstat(absolutePath);
		} catch {
			const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
			if (normalized) {
				excluded.push({ path: normalized, reason: "unreadable:stat" });
			}
			return;
		}

		// Never follow symlinks blindly: resolve and require containment.
		if (entryStat.isSymbolicLink()) {
			let target: string;
			try {
				target = await realpath(absolutePath);
			} catch {
				const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
				if (normalized) {
					excluded.push({ path: normalized, reason: "unreadable:symlink" });
				}
				return;
			}
			if (!isWithinRoot(resolvedRoot, target)) {
				const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
				if (normalized) {
					excluded.push({
						path: normalized,
						reason: "unsafe:symlink-escape",
					});
				}
				return;
			}
			try {
				entryStat = await stat(target);
			} catch {
				const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
				if (normalized) {
					excluded.push({ path: normalized, reason: "unreadable:stat" });
				}
				return;
			}
			if (entryStat.isDirectory()) {
				// Avoid symlink cycles: do not descend into linked directories.
				const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
				if (normalized) {
					excluded.push({ path: normalized, reason: "unsafe:symlink-dir" });
				}
				return;
			}
		}

		if (entryStat.isDirectory()) {
			let children: string[];
			try {
				children = await readdir(absolutePath);
			} catch {
				const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
				if (normalized) {
					excluded.push({ path: normalized, reason: "unreadable:directory" });
				}
				return;
			}
			for (const child of children) {
				await visit(join(absolutePath, child));
			}
			return;
		}

		if (!entryStat.isFile()) return;

		const normalized = toNormalizedRelative(resolvedRoot, absolutePath);
		if (!normalized) {
			return;
		}

		// Readability probe (no bytes loaded): unreadable files are excluded
		// here so the scan never fails later; content loading stays in
		// `manifest.ts`.
		let handle: Awaited<ReturnType<typeof open>> | undefined;
		try {
			handle = await open(absolutePath, "r");
		} catch {
			excluded.push({ path: normalized, reason: "unreadable:file" });
			return;
		} finally {
			if (handle) {
				try {
					await handle.close();
				} catch {}
			}
		}

		const builtIn = isBuiltInExcluded(normalized, false);
		if (builtIn.excluded) {
			excluded.push({
				path: normalized,
				reason: builtIn.reason ?? "built-in:excluded",
			});
			return;
		}
		if (matchesCustomIgnore(normalized, false, rules.patterns)) {
			excluded.push({ path: normalized, reason: "custom:ignore" });
			return;
		}
		files.push({ path: normalized, size: entryStat.size });
	}

	await visit(resolvedRoot);

	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	excluded.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { root: resolvedRoot, files, excluded };
}
