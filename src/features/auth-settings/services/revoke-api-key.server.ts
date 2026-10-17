import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

export async function revokeApiKey({ params }: { params: { id: string } }) {
	const user = await requireUser(getRequestHeaders());
	const { db } = await import("@/db");
	const { apiKeys } = await import("@/db/schema");
	const { id } = params;

	const deleted = await db
		.delete(apiKeys)
		.where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
		.returning({ id: apiKeys.id });
	if (!deleted.length)
		return Response.json({ error: "API key not found" }, { status: 404 });
	return Response.json({ success: true });
}
