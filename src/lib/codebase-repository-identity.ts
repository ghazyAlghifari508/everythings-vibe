/**
 * Stable repository identity.
 *
 * A repository folder name is not an identity: two unrelated projects can share
 * a name, and the same repository can be cloned into a differently named
 * folder. Identity therefore comes from the Git remote, normalized so the same
 * remote written several ways (ssh, https, with or without `.git`, with a
 * different case or a trailing slash) produces one value.
 *
 * Two rules are absolute here:
 *
 *  - a remote URL carrying credentials never leaves this module intact, and the
 *    normalized value never contains userinfo, tokens, or a local path;
 *  - an unverifiable repository returns `null`, and callers must treat `null` as
 *    "no identity" rather than merging anything by name similarity.
 */

/** Credentials embedded in a remote URL: `scheme://user:token@host/...`. */
const URL_USERINFO_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^/@]+@/i;
/** Scp-style remote with a username: `git@host:owner/repo.git`. */
const SCP_LIKE_PATTERN = /^[^/@\s]+@([^/:\s]+):(.+)$/;
/** `scheme://host/path` — the only shape that survives normalization. */
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/(.+)$/i;
/** A Windows drive or UNC prefix, which is a local path, never a remote. */
const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:[\\/]|^\\\\/;
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\//i;
const TRAILING_SLASHES_PATTERN = /\/+$/;
const GIT_SUFFIX_PATTERN = /\.git$/i;
/**
 * Path segments that are transport markers rather than repository identity.
 *
 * Deliberately a short, unambiguous list. `_git` is Azure DevOps' separator and
 * `scm` is Bitbucket Server's; neither can be a repository's own name. Generic
 * words such as `git` or `v1` are NOT stripped: they are legitimate group names
 * on self-hosted hosts, and removing them could merge two different
 * repositories, which is worse than leaving one remote with two spellings.
 */
const NON_IDENTITY_SEGMENTS = new Set(["_git", "scm"]);

/**
 * A value already in normalized identity form: `host/segment[/segment...]`.
 *
 * The CLI may send its own normalized identity back (and a replayed handshake
 * can resend it), so `normalizeRepositoryIdentity` must be idempotent over its
 * own output. Without this branch the value would be rejected as "not a remote",
 * silently dropping the identity and skipping the stored-identity mismatch
 * guard. Deliberately narrow: a host segment cannot be a local path, cannot
 * carry a scheme or userinfo, and cannot be a single dotless word such as
 * `app`, so a folder name or an unverifiable value still normalizes to `null`.
 */
const NORMALIZED_IDENTITY_PATTERN =
	/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^/?#@:\s]+)+$/i;

/**
 * A `.` or `..` path segment inside an otherwise normalized-looking value.
 *
 * Such a segment is a filesystem coordinate, never repository identity. The
 * value never becomes a display name (the folder rule rejects separators), but
 * the identity branch must not accept a traversal-shaped string at all.
 */
function hasTraversalSegment(value: string): boolean {
	return value
		.split("/")
		.some((segment) => segment === "." || segment === "..");
}

/**
 * Extract the repository path from a remote URL, dropping everything that is
 * not part of identity: scheme, credentials, host, port, and query/fragment.
 * The host is kept because two hosts can legitimately serve same-named paths.
 */
function splitRemote(remote: string): { host: string; path: string } | null {
	const trimmed = remote.trim();
	if (!trimmed) return null;
	// A local filesystem path is not a shareable identity.
	if (WINDOWS_PATH_PATTERN.test(trimmed)) return null;
	if (trimmed.startsWith("/") || trimmed.startsWith("./")) return null;

	const scpLike = SCP_LIKE_PATTERN.exec(trimmed);
	if (scpLike && !URL_LIKE_PATTERN.test(trimmed)) {
		const [, host, path] = scpLike;
		return path ? { host, path } : null;
	}

	const withoutScheme = URL_LIKE_PATTERN.exec(trimmed);
	if (!withoutScheme) return null;
	let rest = withoutScheme[1];
	// Credentials and port live between the scheme and the first slash.
	const slashIndex = rest.indexOf("/");
	if (slashIndex === -1) return null;
	const authority = rest.slice(0, slashIndex);
	rest = rest.slice(slashIndex + 1);
	const hostWithPort = authority.includes("@")
		? authority.slice(authority.lastIndexOf("@") + 1)
		: authority;
	const host = hostWithPort.includes(":")
		? hostWithPort.slice(0, hostWithPort.lastIndexOf(":"))
		: hostWithPort;
	if (!host) return null;
	return { host, path: rest };
}

/**
 * Normalize a Git remote URL into a stable identity, or `null` when it cannot
 * be verified.
 *
 * The result is `host/owner/repo` in lowercase, with `.git`, trailing slashes,
 * ports, credentials, and query strings removed. Callers must treat `null` as
 * "identity unknown" and never fall back to comparing folder names.
 */
export function normalizeRepositoryIdentity(
	remoteUrl: string | null | undefined,
): string | null {
	if (typeof remoteUrl !== "string") return null;
	const trimmed = remoteUrl.trim();
	if (!trimmed) return null;
	// Defence in depth: a credentialed URL must never survive as an identity.
	if (URL_USERINFO_PATTERN.test(trimmed) && !SCP_LIKE_PATTERN.test(trimmed)) {
		return normalizeRepositoryIdentity(
			trimmed.replace(URL_USERINFO_PATTERN, (match) => {
				const scheme = SCHEME_PATTERN.exec(match)?.[1] ?? "https";
				return `${scheme}://`;
			}),
		);
	}

	const split = splitRemote(trimmed);
	if (!split) {
		// Already-normalized identity (`host/owner/repo`): reuse it verbatim so
		// the function is idempotent over its own output. Only a structured,
		// multi-segment value with a real dotted host qualifies.
		return NORMALIZED_IDENTITY_PATTERN.test(trimmed) &&
			!hasTraversalSegment(trimmed)
			? trimmed.toLowerCase()
			: null;
	}

	const path = split.path
		.split(/[?#]/)[0]
		.replace(TRAILING_SLASHES_PATTERN, "")
		.replace(GIT_SUFFIX_PATTERN, "")
		.replace(TRAILING_SLASHES_PATTERN, "");
	if (!path) return null;

	const segments = path
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
	if (segments.length === 0) return null;
	const meaningful = segments.filter(
		(segment) => !NON_IDENTITY_SEGMENTS.has(segment.toLowerCase()),
	);
	if (meaningful.length === 0) return null;

	const host = split.host.toLowerCase();
	return [host, ...meaningful.map((segment) => segment.toLowerCase())].join(
		"/",
	);
}

export interface RepositoryIdentityComparison {
	/** Whether the two values describe the same repository. */
	matches: boolean;
	/** Whether the stored identity is absent and can be adopted. */
	adoptable: boolean;
}

/**
 * Compare a stored identity with a freshly reported one.
 *
 * `null` on either side is never a match: an unknown identity must not be
 * treated as agreement. A null stored value is `adoptable`, which is how a
 * repository registered before this contract existed acquires an identity on
 * its next sync.
 */
export function compareRepositoryIdentity(
	stored: string | null | undefined,
	reported: string | null | undefined,
): RepositoryIdentityComparison {
	const left = typeof stored === "string" ? stored.trim() : "";
	const right = typeof reported === "string" ? reported.trim() : "";
	if (!left) return { matches: false, adoptable: Boolean(right) };
	if (!right) return { matches: false, adoptable: false };
	return { matches: left === right, adoptable: false };
}
