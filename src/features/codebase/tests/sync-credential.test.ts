import { expect, test } from "vitest";
import { deriveSyncToken, hashSyncToken } from "../services/sync.server";

test("retryable credentials are scoped to owner, session and server secret", () => {
	const token = deriveSyncToken("owner", "session", "server-secret");
	expect(deriveSyncToken("owner", "session", "server-secret")).toBe(token);
	expect(deriveSyncToken("other", "session", "server-secret")).not.toBe(token);
	expect(deriveSyncToken("owner", "other", "server-secret")).not.toBe(token);
	expect(deriveSyncToken("owner", "session", "rotated-secret")).not.toBe(token);
	expect(hashSyncToken(token)).not.toBe(token);
});
