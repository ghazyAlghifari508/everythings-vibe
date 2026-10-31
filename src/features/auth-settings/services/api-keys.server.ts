import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, eq, isNotNull, isNull, like, lt } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { isApiKeyScope } from "../types/api-key-scopes";
import {
	AUTO_API_KEY_NAME_PREFIX,
	apiKeyViewFields,
	resolveAutoApiKeyPolicy,
	supersedeCutoff,
} from "./api-key-lifecycle";
import { mintApiKey } from "./api-key-mint";

const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(100),
	scopes: z.array(z.string()).min(1),
});

const SECRET_RESPONSE_HEADERS = {
	"Cache-Control": "no-store",
	Pragma: "no-cache",
};

export async function listApiKeys() {
	const user = await requireUser(getRequestHeaders());
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");
	const now = new Date();
	const rows = await db
		.select({
			id: apiKeys.id,
			name: apiKeys.name,
			keyPrefix: apiKeys.keyPrefix,
			scopes: apiKeys.scopes,
			lastUsedAt: apiKeys.lastUsedAt,
			createdAt: apiKeys.createdAt,
			expiresAt: apiKeys.expiresAt,
		})
		.from(apiKeys)
		.where(eq(apiKeys.userId, user.id))
		.orderBy(asc(apiKeys.createdAt));
	return Response.json({
		keys: rows.map((row) => ({
			...row,
			...apiKeyViewFields(row, now),
		})),
	});
}

export async function createApiKey({ request }: { request: Request }) {
	const user = await requireUser(getRequestHeaders());
	const parsed = createApiKeySchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success)
		return Response.json(
			{ error: "Nama key (1-100 karakter) dan minimal satu scope wajib diisi" },
			{ status: 400 },
		);
	const { name, scopes } = parsed.data;

	if (scopes.some((scope) => !isApiKeyScope(scope)))
		return Response.json({ error: "Scope tidak valid" }, { status: 400 });
	// The automatic namespace is server-owned: accepting it here would let a
	// hand-written name hide a manual key from the lifecycle controls.
	if (name.startsWith(AUTO_API_KEY_NAME_PREFIX))
		return Response.json(
			{
				error: `Nama key tidak boleh diawali "${AUTO_API_KEY_NAME_PREFIX}" (khusus key otomatis)`,
			},
			{ status: 400 },
		);

	const { rawKey, keyHash, keyPrefix } = mintApiKey();
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");

	const [inserted] = await db
		.insert(apiKeys)
		.values({
			id: crypto.randomUUID(),
			userId: user.id,
			name,
			key: keyHash,
			keyPrefix,
			scopes,
		})
		.returning({ id: apiKeys.id });
	if (!inserted)
		return Response.json({ error: "Gagal membuat API key" }, { status: 500 });
	// One-time bearer credential: must never be cached by
	// browsers, proxies, or history.
	return Response.json(
		{ id: inserted.id, rawKey },
		{ headers: SECRET_RESPONSE_HEADERS },
	);
}

/**
 * Deliberate housekeeping over the authenticated user's own credentials.
 *
 * Two bounded steps, in this order so they cannot interfere: automatic
 * credentials minted before the expiry policy existed get a deadline instead of
 * being deleted (one may belong to an agent that is running right now, so it
 * keeps the same supersede grace a fresh handoff would give it), then rows whose
 * explicit expiry has already passed are dropped — they already fail bearer
 * authentication, so removing them revokes nothing live. Manual keys with no
 * expiry are never matched: only the user can decide when a hand-written
 * credential is obsolete. Idempotent; a second call reports zero work.
 */
export async function cleanupObsoleteApiKeys() {
	const user = await requireUser(getRequestHeaders());
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");

	const now = new Date();
	const cutoff = supersedeCutoff(now, resolveAutoApiKeyPolicy(process.env));
	const revoked = await db
		.update(apiKeys)
		.set({ expiresAt: cutoff })
		.where(
			and(
				eq(apiKeys.userId, user.id),
				like(apiKeys.name, `${AUTO_API_KEY_NAME_PREFIX}%`),
				isNull(apiKeys.expiresAt),
			),
		)
		.returning({ id: apiKeys.id });
	const deleted = await db
		.delete(apiKeys)
		.where(
			and(
				eq(apiKeys.userId, user.id),
				isNotNull(apiKeys.expiresAt),
				lt(apiKeys.expiresAt, now),
			),
		)
		.returning({ id: apiKeys.id });

	return Response.json({
		revoked: revoked.length,
		deleted: deleted.length,
		expiresAt: cutoff.toISOString(),
	});
}
