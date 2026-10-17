// Server-only GET body for `/api/kanban/stream`: an SSE poll of the project's
// Kanban data. Ownership is re-validated on every tick, so a project deleted or
// reassigned mid-stream closes the stream instead of serving stale tenants.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getKanbanData } from "@/features/greenfield/services/task-kanban";
import { KANBAN_SSE_INTERVAL_MS } from "@/lib/constants";
import { requireUser } from "@/lib/session";

export async function handleKanbanStreamRequest(
	request: Request,
): Promise<Response> {
	let headers: Headers | undefined;
	try {
		const { getRequestHeaders } = await import("@tanstack/react-start/server");
		headers = getRequestHeaders();
	} catch (e) {
		console.warn("Failed to get request headers from start server:", e);
	}
	const user = await requireUser(headers ?? request.headers);

	const url = new URL(request.url);
	const projectId = url.searchParams.get("projectId");
	if (!projectId) {
		return Response.json({ error: "projectId required" }, { status: 400 });
	}

	// Ownership check — app-level WHERE user_id (no RLS), same as $pid handler.
	const [proj] = await db
		.select({ id: projects.id })
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, user.id),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!proj) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stop = (controller: ReadableStreamDefaultController) => {
		stopped = true;
		if (timer !== undefined) clearTimeout(timer);
		try {
			controller.close();
		} catch {}
	};
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const enc = new TextEncoder();
			let consecutiveErrors = 0;
			const MAX_CONSECUTIVE_ERRORS = 5;

			const send = async () => {
				if (stopped) return;
				try {
					// Re-validate ownership on every tick: the project
					// may be deleted or reassigned while the stream
					// is open. Close instead of serving stale tenants.
					const [proj] = await db
						.select({ id: projects.id })
						.from(projects)
						.where(
							and(
								eq(projects.id, projectId),
								eq(projects.userId, user.id),
								isNull(projects.deletedAt),
							),
						)
						.limit(1);
					if (!proj) {
						stop(controller);
						return;
					}
					const data = await getKanbanData(projectId);
					if (stopped) return;
					consecutiveErrors = 0;
					controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch (e) {
					consecutiveErrors++;
					// Controller may be closed after abort; swallow.
					// Log only when still open so we see real DB errors.
					try {
						console.error("kanban SSE send error:", e);
					} catch {}
					if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
						try {
							controller.enqueue(
								enc.encode(
									`data: ${JSON.stringify({ error: "Gagal memuat pembaruan Kanban." })}\n\n`,
								),
							);
						} catch {}
						stop(controller);
						return;
					}
				}

				// Self-scheduling timeout avoids overlapping sends if getKanbanData
				// takes longer than the interval under database load.
				if (!stopped) {
					timer = setTimeout(send, KANBAN_SSE_INTERVAL_MS);
				}
			};

			request.signal.addEventListener("abort", () => {
				stop(controller);
			});

			await send();
		},
		cancel(controller) {
			stop(controller);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
