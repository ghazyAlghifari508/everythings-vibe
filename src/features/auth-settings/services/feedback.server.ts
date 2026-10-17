import { getRequestHeaders } from "@tanstack/react-start/server";
import { getSessionFromHeaders } from "@/lib/session";
import { type FeedbackPayload, parseFeedbackBody } from "./feedback";

export async function submitFeedback({ request }: { request: Request }) {
	const session = await getSessionFromHeaders(getRequestHeaders());
	const body = await request.json().catch(() => null);
	let payload: FeedbackPayload;
	try {
		payload = parseFeedbackBody(body);
	} catch {
		return Response.json({ error: "Message required" }, { status: 400 });
	}

	const { db } = await import("@/db");
	const { feedback } = await import("@/db/schema");
	await db.insert(feedback).values({
		id: crypto.randomUUID(),
		userId: session?.user.id ?? null,
		message: payload.message,
		type: payload.type,
	});

	return Response.json({ success: true });
}
