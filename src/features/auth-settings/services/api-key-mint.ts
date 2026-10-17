import { createHash, randomBytes } from "node:crypto";

/**
 * Single minting point for the public REST / CLI bearer credential.
 *
 * The prefix is user-visible: the raw key is shown once in Settings and copied
 * into a config file, so it carries the product's brand. Lookup is by SHA-256
 * hash (`apiKeys.key`), never by prefix, so renaming the prefix invalidates
 * nothing that already exists in the database.
 *
 * Lives apart from `api-key-auth.ts` so importing it pulls in nothing but
 * node:crypto — no db, no drizzle.
 */
const API_KEY_PREFIX = "vibe_";
const API_KEY_SECRET_BYTES = 32;
/** Characters kept in `keyPrefix`, which is the non-secret label shown in lists. */
const KEY_PREFIX_DISPLAY_LENGTH = 10;

export interface MintedApiKey {
	/** Returned to the user exactly once; only its hash is persisted. */
	rawKey: string;
	keyHash: string;
	keyPrefix: string;
}

export function mintApiKey(): MintedApiKey {
	const rawKey = `${API_KEY_PREFIX}${randomBytes(API_KEY_SECRET_BYTES).toString("hex")}`;
	return {
		rawKey,
		keyHash: createHash("sha256").update(rawKey).digest("hex"),
		keyPrefix: rawKey.slice(0, KEY_PREFIX_DISPLAY_LENGTH),
	};
}
