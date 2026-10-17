import { getRequestHeaders } from "@tanstack/react-start/server";
import { requireUser } from "@/lib/session";
import { mintApiKey } from "./api-key-mint";

const ALL_SCOPES = [
	"read:project",
	"write:task:status",
	"write:subtask:status",
];

export async function createAutoApiKey() {
	const user = await requireUser(getRequestHeaders());
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");

	// Don't delete existing auto-keys — raw keys aren't stored so we can't
	// return an old one; keeping previous keys avoids 401 for in-flight agents.
	// ponytail: auto-keys accumulate per click; cleanup by expiry if this grows.

	const { rawKey, keyHash, keyPrefix } = mintApiKey();

	const [inserted] = await db
		.insert(apiKeys)
		.values({
			id: crypto.randomUUID(),
			userId: user.id,
			name: `auto-cli-${Date.now()}`,
			key: keyHash,
			keyPrefix,
			scopes: ALL_SCOPES,
		})
		.returning({ id: apiKeys.id });

	if (!inserted)
		return Response.json({ error: "Gagal membuat API key" }, { status: 500 });
	return Response.json({ rawKey });
}
