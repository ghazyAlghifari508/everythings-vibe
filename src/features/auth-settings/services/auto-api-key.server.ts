import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, isNotNull, like, lt, sql } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import {
	AUTO_API_KEY_NAME_PREFIX,
	buildAutoKeyName,
	nextAutoKeyExpiry,
	resolveAutoApiKeyPolicy,
} from "./api-key-lifecycle";
import { mintApiKey } from "./api-key-mint";

const SECRET_RESPONSE_HEADERS = {
	"Cache-Control": "no-store",
	Pragma: "no-cache",
};

export async function createAutoApiKey() {
	const user = await requireUser(getRequestHeaders());
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");

	const now = new Date();
	const policy = resolveAutoApiKeyPolicy(process.env);
	const automatic = and(
		eq(apiKeys.userId, user.id),
		like(apiKeys.name, `${AUTO_API_KEY_NAME_PREFIX}%`),
	);

	const issued = await db.transaction(async (tx) => {
		// Serialize issuance per user: without the lock, parallel handoffs each
		// see zero credentials and mint a parallel active set.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

		// Expired automatic credentials already fail authentication, so their
		// rows are dropped instead of accumulating as list noise. Idempotent.
		await tx
			.delete(apiKeys)
			.where(
				and(
					automatic,
					isNotNull(apiKeys.expiresAt),
					lt(apiKeys.expiresAt, now),
				),
			);

		// The stored value is a hash, so the raw secret of an existing row can
		// never be reprinted: this handoff always mints a fresh credential.
		const { rawKey, keyHash, keyPrefix } = mintApiKey();
		const expiresAt = nextAutoKeyExpiry(now, policy);
		const [inserted] = await tx
			.insert(apiKeys)
			.values({
				id: crypto.randomUUID(),
				userId: user.id,
				name: buildAutoKeyName(now),
				key: keyHash,
				keyPrefix,
				scopes: policy.scopes,
				expiresAt,
			})
			.returning({ id: apiKeys.id });

		return inserted ? { rawKey, expiresAt } : null;
	});

	if (!issued)
		return Response.json({ error: "Gagal membuat API key" }, { status: 500 });

	return Response.json(
		{ rawKey: issued.rawKey, expiresAt: issued.expiresAt.toISOString() },
		{ headers: SECRET_RESPONSE_HEADERS },
	);
}
