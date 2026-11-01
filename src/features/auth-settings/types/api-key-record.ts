import type { ApiKeyRecord } from "./api-key-contracts";

/** A credential the lifecycle controls can still act on: already expired, or an
 * automatic handoff key that predates the expiry policy. A manual key without an
 * expiry is long-lived on purpose and never a cleanup target. */
export function isObsoleteKey(key: ApiKeyRecord): boolean {
	return (
		key.state === "expired" ||
		(key.source === "automatic" && key.state === "no-expiry")
	);
}
