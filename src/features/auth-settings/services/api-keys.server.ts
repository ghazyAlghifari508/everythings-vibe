import { getRequestHeaders } from "@tanstack/react-start/server";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { mintApiKey } from "./api-key-mint";

const ALLOWED_SCOPES = [
	"read:project",
	"write:task:status",
	"write:subtask:status",
];

export async function listApiKeys() {
	const user = await requireUser(getRequestHeaders());
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");
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
	return Response.json({ keys: rows });
}

export async function createApiKey({ request }: { request: Request }) {
	const user = await requireUser(getRequestHeaders());
	const body = await request.json();
	const { name, scopes } = body;

	if (!name || typeof name !== "string" || name.length < 1 || name.length > 100)
		return Response.json(
			{ error: "Nama key harus 1-100 karakter" },
			{ status: 400 },
		);
	if (!Array.isArray(scopes) || scopes.length === 0)
		return Response.json(
			{ error: "Minimal satu scope harus dipilih" },
			{ status: 400 },
		);
	if (scopes.some((s: string) => !ALLOWED_SCOPES.includes(s)))
		return Response.json({ error: "Scope tidak valid" }, { status: 400 });

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
		{
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		},
	);
}
