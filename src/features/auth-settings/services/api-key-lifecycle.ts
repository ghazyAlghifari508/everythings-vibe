import type { ApiKeyScope } from "../types/api-key-scopes";
import { AUTO_API_KEY_SCOPES } from "../types/api-key-scopes";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Reserved `api_keys.name` namespace for credentials minted by the AI-agent
 * handoff. The literal matches the names written before this policy existed, so
 * the accumulated legacy rows are classified without a migration. Manual
 * creation rejects this prefix, which keeps the classification honest for rows
 * created from now on.
 */
export const AUTO_API_KEY_NAME_PREFIX = "auto-cli-";

export const AUTO_API_KEY_TTL_DAY_BOUNDS = { min: 1, max: 90 } as const;
export const AUTO_API_KEY_GRACE_HOUR_BOUNDS = { min: 0, max: 168 } as const;

/** A handoff credential has to outlive a multi-phase implementation cycle where
 * the agent pauses on human checkpoints, so the default is a full cycle: long
 * enough to stay usable, bounded enough that a forgotten key cannot become
 * permanent access. */
export const DEFAULT_AUTO_API_KEY_TTL_DAYS = 30;

/** Only explicit legacy cleanup assigns this deadline; opening another handoff
 * never shortens an existing credential's lifetime. */
export const DEFAULT_AUTO_API_KEY_SUPERSEDE_GRACE_HOURS = 72;

export const AUTO_API_KEY_TTL_DAYS_ENV = "AUTO_API_KEY_TTL_DAYS";
export const AUTO_API_KEY_SUPERSEDE_GRACE_HOURS_ENV =
	"AUTO_API_KEY_SUPERSEDE_GRACE_HOURS";

export interface AutoApiKeyPolicy {
	ttlMs: number;
	supersedeGraceMs: number;
	/** Scopes an minted automatic credential receives. Kept beside the lifetime
	 * rule so lifecycle and privilege are decided in one place. */
	scopes: ApiKeyScope[];
}

function clampEnv(
	raw: string | undefined,
	fallback: number,
	min: number,
	max: number,
): number {
	if (!raw || raw.trim() === "") return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Every handoff must mint a new credential: only the SHA-256 hash is stored, so
 * a raw key can never be reprinted for an existing row. Accumulation is bounded
 * by lifetime instead of reuse: every new credential has the full TTL, and
 * expired automatic rows are dropped. Existing deadlines never change during
 * issuance, preserving in-flight agents and legacy credentials.
 */
export function resolveAutoApiKeyPolicy(
	env: Record<string, string | undefined>,
): AutoApiKeyPolicy {
	const ttlDays = clampEnv(
		env[AUTO_API_KEY_TTL_DAYS_ENV],
		DEFAULT_AUTO_API_KEY_TTL_DAYS,
		AUTO_API_KEY_TTL_DAY_BOUNDS.min,
		AUTO_API_KEY_TTL_DAY_BOUNDS.max,
	);
	const graceHours = clampEnv(
		env[AUTO_API_KEY_SUPERSEDE_GRACE_HOURS_ENV],
		DEFAULT_AUTO_API_KEY_SUPERSEDE_GRACE_HOURS,
		AUTO_API_KEY_GRACE_HOUR_BOUNDS.min,
		AUTO_API_KEY_GRACE_HOUR_BOUNDS.max,
	);
	return {
		ttlMs: ttlDays * DAY_MS,
		supersedeGraceMs: graceHours * HOUR_MS,
		scopes: [...AUTO_API_KEY_SCOPES],
	};
}

export function nextAutoKeyExpiry(now: Date, policy: AutoApiKeyPolicy): Date {
	return new Date(now.getTime() + policy.ttlMs);
}

/** Latest instant a superseded credential may still live. */
export function supersedeCutoff(now: Date, policy: AutoApiKeyPolicy): Date {
	return new Date(now.getTime() + policy.supersedeGraceMs);
}

/** Names are labels, not identifiers: two handoffs issued in the same millisecond
 * would otherwise render as one indistinguishable row in Settings, so each
 * carries a short unique tail. The reserved prefix is what classifies it. */
export function buildAutoKeyName(now: Date): string {
	return `${AUTO_API_KEY_NAME_PREFIX}${now.getTime()}-${crypto
		.randomUUID()
		.slice(0, 8)}`;
}

export function isAutomaticKey(name: string | null | undefined): boolean {
	return typeof name === "string" && name.startsWith(AUTO_API_KEY_NAME_PREFIX);
}

export type TimestampInput = Date | string | null | undefined;

export function toTimestamp(value: TimestampInput): Date | null {
	if (value == null) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** True when the row carries a deadline that has passed. A present but
 * unparseable deadline counts as expired — fail closed, exactly like the bearer
 * check — while a missing deadline stays a long-lived credential. */
export function isExpiredKey(expiresAt: TimestampInput, now: Date): boolean {
	if (expiresAt == null) return false;
	const expiry = toTimestamp(expiresAt);
	return expiry === null || expiry.getTime() <= now.getTime();
}

export type KeyLifecycleState = "no-expiry" | "active" | "expired";

export interface KeyLifecycle {
	kind: "automatic" | "manual";
	state: KeyLifecycleState;
	expiresAt: Date | null;
}

/** Expiry-aware view of one credential row. Shared by the Settings surface and
 * the lifecycle controls so a label can never drift from the enforcement rule. */
export function describeKeyLifecycle(
	key: { name: string; expiresAt: TimestampInput },
	now: Date = new Date(),
): KeyLifecycle {
	const expiresAt = toTimestamp(key.expiresAt);
	const kind: KeyLifecycle["kind"] = isAutomaticKey(key.name)
		? "automatic"
		: "manual";
	if (key.expiresAt == null) return { kind, state: "no-expiry", expiresAt };
	// One shared predicate decides the label and the enforcement, and a corrupt
	// deadline must not render as "Never" while authentication refuses it.
	if (isExpiredKey(key.expiresAt, now))
		return { kind, state: "expired", expiresAt };
	return { kind, state: "active", expiresAt };
}

export interface ApiKeyViewFields {
	source: KeyLifecycle["kind"];
	state: KeyLifecycle["state"];
}

/** Non-secret lifecycle labels added to every key list surface. The state comes
 * from the server clock so the rendered HTML cannot disagree with what the
 * bearer check will do. */
export function apiKeyViewFields(
	key: { name: string; expiresAt: TimestampInput },
	now: Date,
): ApiKeyViewFields {
	const lifecycle = describeKeyLifecycle(key, now);
	return { source: lifecycle.kind, state: lifecycle.state };
}
