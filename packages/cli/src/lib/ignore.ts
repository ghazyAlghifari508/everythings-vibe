/**
 * Codebase ignore parsing and built-in exclusion rules for codebase sync.
 *
 * The canonical custom ignore file is `.everythingsvibeignore`. A legacy
 * `.prdfyignore` is still honored when the canonical file is absent, so
 * previously excluded paths are never silently re-included. Custom rules
 * supplement built-in protection; they can never override secret or
 * unsafe-path exclusions. Built-ins are enforced independently by the
 * repository scanner.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type IgnoreFileSource = "canonical" | "legacy" | "none";

export interface IgnoreRules {
	/** Absolute repository root the rules were read from. */
	root: string;
	/** Custom patterns from the active ignore file (negations dropped, see below). */
	patterns: string[];
	/** Raw file content (`""` when no ignore file is present). */
	raw: string;
	/** Negation lines that were dropped because user rules cannot lift built-ins. */
	droppedNegations: string[];
	/** Which control file supplied the rules. */
	source: IgnoreFileSource;
	/** Active control filename, or null when no ignore file exists. */
	filename: string | null;
}

/** Canonical custom ignore filename created by new syncs. */
export const CODEBASE_IGNORE_FILENAME = ".everythingsvibeignore";
/** Legacy filename honored only when the canonical file is absent. */
export const LEGACY_IGNORE_FILENAME = ".prdfyignore";

/**
 * Default `.everythingsvibeignore` written on first sync. Every pattern is
 * commented out: built-in exclusions already cover secrets, build output, and
 * binaries, and an active pattern here would silently change which files get
 * uploaded.
 */
export const CODEBASE_IGNORE_TEMPLATE = `# .everythingsvibeignore — exclusions untuk sync codebase VibeEverything.
#
# File ini bersifat lokal. JANGAN commit ke repositori.
#
# VibeEverything CLI sudah mengecualikan hal berikut secara otomatis, jadi tidak perlu
# ditulis ulang di sini:
#   - file rahasia      : .env*, *.pem, *.key, *.p12, *.pfx, sertifikat
#   - dependensi & build: node_modules/, dist/, build/, coverage/, .git/
#   - state deploy lokal: .vercel/
#   - dump database     : *.sql, *.sqlite, *.db, *.dump
#   - file binary       : gambar, audio, video, arsip, executable
#
# File konfigurasi deploy yang sengaja disimpan (vercel.json, netlify.toml, dan
# sejenisnya) tetap ikut ter-sync; hanya folder state lokal yang dikecualikan.
#
# Tambahkan pola di bawah untuk mengecualikan path khusus repositori kamu.
# Satu pola per baris. Mendukung *, **, ?, dan awalan direktori diakhiri "/".
# Baris diawali "#" diabaikan. Pola negasi ("!...") diabaikan agar tidak
# membatalkan perlindungan bawaan.
#
# Contoh:
# internal/
# scripts/seed-data/
# *.log
`;

/** Directory names that are always excluded, at any depth. */
const BUILT_IN_DIRECTORIES = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".vercel",
	"out",
	"credentials",
	"secrets",
]);

/** File extensions that are always excluded (keys, certs, dumps, backups). */
const BUILT_IN_EXTENSIONS = new Set([
	".pem",
	".key",
	".p12",
	".pfx",
	".crt",
	".cer",
	".der",
	".sql",
	".dump",
	".sqlite",
	".sqlite3",
	".db",
	".bak",
	".orig",
	".rej",
]);

export type BuiltInExclusionReason =
	| "built-in:vcs"
	| "built-in:dependency"
	| "built-in:build"
	| "built-in:dotenv"
	| "built-in:key-material"
	| "built-in:database-dump"
	| "built-in:backup"
	| "built-in:secret-directory"
	| "built-in:ignore-file";

/**
 * Read the active custom ignore file from the repository root without
 * mutating the repo. The canonical `.everythingsvibeignore` takes precedence
 * when present; a legacy `.prdfyignore` is honored only as a fallback so its
 * exclusions are never silently lost. Missing files yield empty patterns.
 * Negation rules (`!...`) are dropped: user rules cannot lift built-in
 * secret/unsafe-path protection. Dropped negations are reported so the caller
 * can warn instead of failing silently.
 */
export async function readCodebaseIgnore(root: string): Promise<IgnoreRules> {
	for (const [filename, source] of [
		[CODEBASE_IGNORE_FILENAME, "canonical"],
		[LEGACY_IGNORE_FILENAME, "legacy"],
	] as const) {
		let raw: string;
		try {
			raw = await readFile(join(root, filename), "utf-8");
		} catch (err) {
			if ((err as NodeJS.ErrnoException)?.code === "ENOENT") continue;
			throw err;
		}
		const patterns: string[] = [];
		const droppedNegations: string[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (trimmed === "" || trimmed.startsWith("#")) continue;
			// Negations are inert: they must never re-include built-in exclusions.
			if (trimmed.startsWith("!")) {
				droppedNegations.push(trimmed);
				continue;
			}
			patterns.push(trimmed);
		}
		return { root, patterns, raw, droppedNegations, source, filename };
	}
	return {
		root,
		patterns: [],
		raw: "",
		droppedNegations: [],
		source: "none",
		filename: null,
	};
}

/**
 * Create the canonical ignore file from the default template when no custom
 * ignore file exists. Idempotent: an existing canonical or legacy file is
 * never read-modified or overwritten, so user rules always survive. Returns
 * whether the file was created by this call and which file is now in effect.
 * The file is local sync configuration; this module never invokes git, so it
 * can never be committed or pushed automatically.
 */
export async function ensureCodebaseIgnore(root: string): Promise<{
	created: boolean;
	source: Exclude<IgnoreFileSource, "none">;
}> {
	for (const [filename, source] of [
		[CODEBASE_IGNORE_FILENAME, "canonical"],
		[LEGACY_IGNORE_FILENAME, "legacy"],
	] as const) {
		try {
			await readFile(join(root, filename), "utf-8");
			return { created: false, source };
		} catch (err) {
			if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
		}
	}
	// "wx" fails if the path appeared concurrently, so two runs cannot clobber
	// each other and an existing file is never truncated.
	try {
		await writeFile(
			join(root, CODEBASE_IGNORE_FILENAME),
			CODEBASE_IGNORE_TEMPLATE,
			{
				encoding: "utf-8",
				flag: "wx",
			},
		);
		return { created: true, source: "canonical" };
	} catch (err) {
		if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
			return { created: false, source: "canonical" };
		}
		throw err;
	}
}

function globToRegExp(glob: string): RegExp {
	let source = "";
	let i = 0;
	while (i < glob.length) {
		const ch = glob[i];
		if (ch === "*") {
			if (glob[i + 1] === "*") {
				// "**" spans path separators; an optional trailing "/" follows.
				if (glob[i + 2] === "/") {
					source += "(?:.*/)?";
					i += 3;
				} else {
					source += ".*";
					i += 2;
				}
			} else {
				source += "[^/]*";
				i += 1;
			}
		} else if (ch === "?") {
			source += "[^/]";
			i += 1;
		} else if (ch === "[") {
			const close = glob.indexOf("]", i + 1);
			if (close === -1) {
				source += "\\[";
				i += 1;
			} else {
				source += glob.slice(i, close + 1);
				i = close + 1;
			}
		} else {
			source += ch.replace(/[.+^${}()|\\]/g, "\\$&");
			i += 1;
		}
	}
	return new RegExp(`^${source}$`);
}

function matchGlob(pattern: string, value: string): boolean {
	return globToRegExp(pattern).test(value);
}

/**
 * Match a repository-relative `/`-separated path against custom patterns.
 * Supports trailing-`/` directory prefixes plus `*`, `**`, `?` globs.
 * Patterns without a `/` also match the basename.
 */
export function matchesCustomIgnore(
	normalizedPath: string,
	isDirectory: boolean,
	patterns: readonly string[],
): boolean {
	const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
	for (let rawPattern of patterns) {
		rawPattern = rawPattern.trim();
		if (rawPattern === "" || rawPattern.startsWith("#")) continue;
		if (rawPattern.startsWith("!")) continue;
		// A leading "/" anchors to the root; strip it since paths are relative.
		const pattern = rawPattern.startsWith("/")
			? rawPattern.slice(1)
			: rawPattern;
		if (pattern.endsWith("/")) {
			const prefix = pattern.slice(0, -1);
			if (
				normalizedPath === prefix ||
				normalizedPath.startsWith(`${prefix}/`)
			) {
				return true;
			}
			continue;
		}
		if (matchGlob(pattern, normalizedPath)) return true;
		if (!pattern.includes("/") && matchGlob(pattern, basename)) return true;
		// Directory match without trailing slash excludes its subtree too.
		if (isDirectory && normalizedPath === pattern) return true;
	}
	return false;
}

/**
 * Built-in exclusion check. Independent of custom ignore files: custom rules
 * cannot override these. Returns the category reason when excluded.
 */
export function isBuiltInExcluded(
	normalizedPath: string,
	isDirectory: boolean,
): { excluded: boolean; reason?: BuiltInExclusionReason } {
	const segments = normalizedPath.split("/");
	for (const segment of segments) {
		if (segment === ".git") return { excluded: true, reason: "built-in:vcs" };
		if (segment === "node_modules") {
			return { excluded: true, reason: "built-in:dependency" };
		}
		if (
			segment === "dist" ||
			segment === "build" ||
			segment === "coverage" ||
			segment === ".next" ||
			// Vercel writes local build/link/deploy state here. Only the folder
			// is excluded; `vercel.json` at any depth stays eligible.
			segment === ".vercel" ||
			segment === "out"
		) {
			return { excluded: true, reason: "built-in:build" };
		}
		if (segment === "credentials" || segment === "secrets") {
			return { excluded: true, reason: "built-in:secret-directory" };
		}
	}
	const basename = segments[segments.length - 1];
	// The CLI's own control files are local config, never source content. Both
	// the canonical file and a legacy file from an older sync are excluded.
	if (
		basename === CODEBASE_IGNORE_FILENAME ||
		basename === LEGACY_IGNORE_FILENAME
	) {
		return { excluded: true, reason: "built-in:ignore-file" };
	}
	if (basename === ".env" || basename.startsWith(".env.")) {
		return { excluded: true, reason: "built-in:dotenv" };
	}
	if (!isDirectory) {
		const dot = basename.lastIndexOf(".");
		// Trailing "~" editor backups have no extension to look up.
		if (basename.endsWith("~")) {
			return { excluded: true, reason: "built-in:backup" };
		}
		if (dot > 0) {
			const ext = basename.slice(dot).toLowerCase();
			if (BUILT_IN_EXTENSIONS.has(ext)) {
				if (
					ext === ".pem" ||
					ext === ".key" ||
					ext === ".p12" ||
					ext === ".pfx" ||
					ext === ".crt" ||
					ext === ".cer" ||
					ext === ".der"
				) {
					return { excluded: true, reason: "built-in:key-material" };
				}
				if (
					ext === ".sql" ||
					ext === ".dump" ||
					ext === ".sqlite" ||
					ext === ".sqlite3" ||
					ext === ".db"
				) {
					return { excluded: true, reason: "built-in:database-dump" };
				}
				return { excluded: true, reason: "built-in:backup" };
			}
		}
	}
	if (isDirectory && BUILT_IN_DIRECTORIES.has(basename)) {
		return { excluded: true, reason: "built-in:build" };
	}
	return { excluded: false };
}
