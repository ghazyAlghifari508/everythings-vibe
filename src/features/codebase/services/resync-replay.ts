import {
	isResyncSessionVerified,
	type SyncStatusResponse,
	syncStatusResponseSchema,
} from "./sync";

export async function isFinishedResyncReplay(
	session: Pick<SyncStatusResponse, "projectId" | "sessionId" | "status">,
	signal: AbortSignal,
): Promise<boolean> {
	if (["ready", "failed", "expired"].includes(session.status)) return true;
	if (!["uploaded", "analyzing"].includes(session.status)) return false;
	const query = new URLSearchParams({ sessionId: session.sessionId });
	const response = await fetch(
		`/api/codebases/${encodeURIComponent(session.projectId)}/status?${query}`,
		{ signal, cache: "no-store" },
	);
	const parsed = syncStatusResponseSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (
		!response.ok ||
		!parsed.success ||
		parsed.data.projectId !== session.projectId ||
		parsed.data.sessionId !== session.sessionId
	)
		throw new Error("Resync status unavailable");
	return (
		["ready", "failed", "expired"].includes(parsed.data.status) ||
		parsed.data.analysisAttemptStatus === "failed" ||
		isResyncSessionVerified({
			status: parsed.data,
			activeSessionId: session.sessionId,
		})
	);
}
