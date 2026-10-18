import { CODEBASE_MAX_ERROR_MESSAGE_CHARS } from "@/features/codebase/types/codebase-constants";

// === Path safety ===
// Manifest/source payloads must carry repository-relative paths only: no
// absolute paths, no `..` escapes, no empty values, no null bytes.
// Backslashes are normalized to `/` first so Windows absolute (`\abs`,
// `C:\...`), UNC (`\\share`), drive-relative (`C:foo`), and
// backslash-traversal (`foo\..\evil`) payloads cannot bypass the check.

export function isSafeRelativePath(path: string): boolean {
	if (!path || path.length === 0) return false;
	if (path.includes("\0")) return false;
	const normalized = path.replace(/\\/g, "/");
	if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
	const segments = normalized.split("/");
	for (const segment of segments) {
		if (segment === "" || segment === "." || segment === "..") return false;
	}
	return true;
}

// === Safe sync errors (Task 4) ===
// Only whitelisted codes reach clients. Unknown/detail errors collapse to
// SYNC_FAILED so tokens, source data, and internals never leak into errors.

export const SYNC_SAFE_ERROR_CODES = [
	"SYNC_FAILED",
	"SYNC_SESSION_ACTIVE",
	"SYNC_SESSION_EXPIRED",
	"SYNC_SESSION_TERMINAL",
	"SYNC_CREDENTIAL_REVOKED",
	"INVALID_SYNC_CREDENTIAL",
	"NO_SYNC_SESSION",
	"CLI_UPDATE_REQUIRED",
	"PROJECT_MODE_MISMATCH",
	"SNAPSHOT_TOO_LARGE",
	"SNAPSHOT_INCOMPLETE",
	"SNAPSHOT_CONFLICT",
	"SNAPSHOT_HASH_MISMATCH",
	"ANALYSIS_FAILED",
	// The CLI handshakes BEFORE it prepares source code, so these two describe
	// a real window that begins only after the server already persisted
	// `connected`. Without them the browser would sit on a stale "preparing"
	// row until the session expired.
	"SCAN_FAILED",
	"BLOCKED_CONTENT",
] as const;

export type SyncSafeErrorCode = (typeof SYNC_SAFE_ERROR_CODES)[number];

export function sanitizeSyncErrorCode(code: unknown): SyncSafeErrorCode {
	if (
		typeof code === "string" &&
		(SYNC_SAFE_ERROR_CODES as readonly string[]).includes(code)
	) {
		return code as SyncSafeErrorCode;
	}
	return "SYNC_FAILED";
}

// === Server-owned failure copy (local preparation window) ===
// The CLI reports only an attempt identity plus a whitelisted code. Every
// user-facing sentence is owned here, because the CLI's own error text embeds
// absolute local paths (`Cannot scan repository root: <abs path>`) and blocked
// file paths. A server-owned string is the only shape that can be persisted
// and rendered without leaking where the repository lives or which files it
// contains.
const SYNC_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
	SYNC_FAILED:
		"Sinkronisasi gagal. Periksa output terminal lalu jalankan ulang prompt.",
	SCAN_FAILED:
		"CLI gagal membaca repository. Pastikan folder ini adalah root repository Git yang bisa dibaca.",
	BLOCKED_CONTENT:
		"Sebagian file ditolak karena terdeteksi konten rahasia. Redaksi atau kecualikan file tersebut lewat .everythingsvibeignore, lalu jalankan ulang.",
	SNAPSHOT_TOO_LARGE:
		"Ukuran snapshot melebihi batas server. Kurangi file yang ikut disinkronkan, lalu jalankan ulang.",
};

export function resolveSyncFailureMessage(code: unknown): string {
	const sanitized = sanitizeSyncErrorCode(code);
	return SYNC_FAILURE_MESSAGES[sanitized] ?? SYNC_FAILURE_MESSAGES.SYNC_FAILED;
}

// === Persisted failure evidence ===
// Stored in `codebase_sync_sessions.metadata` beside the handshake evidence:
// both are facts about this attempt that must outlive the attempt itself so a
// failed session stays explicable after a refresh. The client-supplied message
// is deliberately discarded — only the sanitized code and the server's own
// copy are written.

const SYNC_FAILURE_CODE_KEY = "failureCode" as const;
const SYNC_FAILURE_MESSAGE_KEY = "failureMessage" as const;
const SYNC_FAILURE_AT_KEY = "failedAt" as const;

export interface SyncFailureEvidence {
	code: SyncSafeErrorCode;
	message: string;
}

export function readSyncFailureMetadata(
	metadata: unknown,
): SyncFailureEvidence | null {
	if (typeof metadata !== "object" || metadata === null) return null;
	const record = metadata as Record<string, unknown>;
	const rawCode = record[SYNC_FAILURE_CODE_KEY];
	if (typeof rawCode !== "string") return null;
	const code = sanitizeSyncErrorCode(rawCode);
	return {
		code,
		message: resolveSyncFailureMessage(code),
	};
}

export function buildFailureMetadata(input: {
	previous: unknown;
	rawCode: unknown;
	failedAt: Date;
}): Record<string, unknown> {
	const previous =
		typeof input.previous === "object" && input.previous !== null
			? (input.previous as Record<string, unknown>)
			: {};
	const code = sanitizeSyncErrorCode(input.rawCode);
	return {
		...previous,
		[SYNC_FAILURE_CODE_KEY]: code,
		[SYNC_FAILURE_MESSAGE_KEY]: resolveSyncFailureMessage(code),
		[SYNC_FAILURE_AT_KEY]: input.failedAt.toISOString(),
	};
}

// === Control characters ===
// C0 controls and DEL never belong in user-facing text or in an identifier.
// One rule backs both `sanitizeSyncErrorMessage` (strip them) and repository
// name validation (reject the name), so it lives here instead of in two
// ad-hoc regexes — and is expressed over code points rather than a literal, so
// it stays lint-clean.

export function hasControlCharacters(value: string): boolean {
	return [...value].some((ch) => {
		const code = ch.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
}

// === Safe sync error messages (Task 5 carry-over) ===
// Analysis writers (Task 6) must store only safe user-facing strings in
// `errorMessage`. As defense-in-depth, the status read boundary passes stored
// messages through this sanitizer: control characters are stripped, length is
// capped, and empty/non-string values collapse to null. Tokens and source
// content must never reach this field.

export function sanitizeSyncErrorMessage(message: unknown): string | null {
	if (typeof message !== "string") return null;
	const stripped = [...message]
		.filter((ch) => !hasControlCharacters(ch))
		.join("")
		.trim();
	if (!stripped) return null;
	return stripped.length > CODEBASE_MAX_ERROR_MESSAGE_CHARS
		? stripped.slice(0, CODEBASE_MAX_ERROR_MESSAGE_CHARS)
		: stripped;
}
