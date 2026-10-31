import { z } from "zod";
import type { KeyLifecycle } from "../services/api-key-lifecycle";

/** One credential row as serialized for the Settings surface. `source` and
 * `state` are computed server-side from the request clock, so the rendered
 * expiry label cannot disagree with what bearer authentication will do. */
export interface ApiKeyRecord {
	id: string;
	name: string;
	key_prefix: string;
	scopes: string[];
	last_used_at: string | null;
	created_at: string;
	expires_at: string | null;
	source: KeyLifecycle["kind"];
	state: KeyLifecycle["state"];
}

/** Raw bearer secret returned exactly once when an automatic handoff credential
 * is minted, with the deadline the server assigned it. Parsed because the secret
 * is about to be pasted into an external agent's context. */
export const mintedApiKeySchema = z.object({
	rawKey: z.string().min(1),
	expiresAt: z.string().datetime(),
});

export type MintedApiKeyResponse = z.infer<typeof mintedApiKeySchema>;

/** Manual creation answers with the new row id plus the one-time secret. */
export const createdApiKeySchema = z.object({
	id: z.string(),
	rawKey: z.string().min(1),
});

/** Housekeeping counters returned by the obsolete-access cleanup. */
export const apiKeyCleanupSchema = z.object({
	revoked: z.number().int().min(0),
	deleted: z.number().int().min(0),
	expiresAt: z.string().datetime(),
});
