import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { mintApiKey } from "@/lib/api-key-mint";
import { requireUser } from "@/lib/session";

const ALL_SCOPES = [
	"read:project",
	"write:task:status",
	"write:subtask:status",
];

export const Route = createFileRoute("/api/settings/api-keys/auto")({
	server: {
		handlers: {
			POST: async () => {
				const user = await requireUser(getRequestHeaders());

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
					return Response.json(
						{ error: "Gagal membuat API key" },
						{ status: 500 },
					);
				return Response.json({ rawKey });
			},
		},
	},
});
