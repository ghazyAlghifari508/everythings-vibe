// Server-only POST bodies for the `/api/v1` status write endpoints (CLI and
// external agents): task status and subtask status.
//
// Both enforce the documented workflow: a task must pass through in_progress
// before completed, and the ownership check plus the write share one
// transaction on the locked task row so concurrent writers serialize.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import {
	apiKeyAuth,
	hasScope,
	verifyProjectOwnership,
} from "@/lib/api-key-auth";

const VALID_STATUSES = ["pending", "in_progress", "completed", "failed"];

export async function handleV1TaskStatusRequest(
	request: Request,
	taskId: string,
): Promise<Response> {
	const auth = await apiKeyAuth(request);
	if ("error" in auth)
		return Response.json({ error: auth.error }, { status: auth.status });
	if (!hasScope(auth, "write:task:status"))
		return Response.json({ error: "Insufficient scopes" }, { status: 403 });

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const { status } = body as { status?: string };
	if (!status || !VALID_STATUSES.includes(status))
		return Response.json(
			{
				error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
			},
			{ status: 400 },
		);

	// The ownership check, workflow check, and write run in one
	// transaction on the locked task row so concurrent writers
	// serialize instead of racing on stale reads.
	const result = await db.transaction(async (tx) => {
		const [task] = await tx
			.select({
				id: tasks.id,
				projectId: tasks.projectId,
				status: tasks.status,
			})
			.from(tasks)
			.where(eq(tasks.id, taskId))
			.limit(1)
			.for("update");
		if (!task || !(await verifyProjectOwnership(auth.userId, task.projectId)))
			return null;

		// Enforce workflow: task must be in_progress before completed.
		// Prevents AI agents from skipping straight to completed.
		if (status === "completed" && task.status === "pending") {
			return { workflowError: true as const };
		}

		const now = new Date();
		const updateData: Record<string, unknown> = {
			status,
			updatedAt: now,
		};
		if (status === "in_progress") updateData.startedAt = now;
		if (status === "completed" || status === "failed")
			updateData.completedAt = now;

		await tx.update(tasks).set(updateData).where(eq(tasks.id, taskId));
		return { workflowError: false as const, updatedAt: now };
	});
	if (!result)
		return Response.json({ error: "Task not found" }, { status: 404 });
	if (result.workflowError) {
		return Response.json(
			{
				error:
					"Task harus in_progress dulu sebelum completed. Jalankan: vibeeverything task update <id> --status in_progress",
			},
			{ status: 400 },
		);
	}
	return Response.json({
		id: taskId,
		status,
		updatedAt: result.updatedAt.toISOString(),
	});
}

export async function handleV1SubtaskStatusRequest(
	request: Request,
	taskId: string,
): Promise<Response> {
	const auth = await apiKeyAuth(request);
	if ("error" in auth)
		return Response.json({ error: auth.error }, { status: auth.status });
	if (!hasScope(auth, "write:subtask:status"))
		return Response.json({ error: "Insufficient scopes" }, { status: 403 });

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	const { subtaskIndex, status } = body as {
		subtaskIndex?: number;
		status?: string;
	};

	if (
		typeof subtaskIndex !== "number" ||
		!Number.isInteger(subtaskIndex) ||
		subtaskIndex < 0
	)
		return Response.json(
			{ error: "subtaskIndex must be a non-negative integer" },
			{ status: 400 },
		);
	if (!status || !VALID_STATUSES.includes(status))
		return Response.json(
			{
				error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
			},
			{ status: 400 },
		);

	// Ownership check and array read-modify-write run in one
	// transaction on the locked task row so concurrent edits to the
	// same subtask list cannot overwrite each other.
	const result = await db.transaction(async (tx) => {
		const [task] = await tx
			.select({
				id: tasks.id,
				projectId: tasks.projectId,
				subtasks: tasks.subtasks,
			})
			.from(tasks)
			.where(eq(tasks.id, taskId))
			.limit(1)
			.for("update");
		if (!task || !(await verifyProjectOwnership(auth.userId, task.projectId)))
			return null;

		const subs = Array.isArray(task.subtasks)
			? [...(task.subtasks as Record<string, unknown>[])]
			: [];
		if (subtaskIndex >= subs.length)
			return { outOfRange: true as const, size: subs.length };
		subs[subtaskIndex] = { ...subs[subtaskIndex], status };
		await tx
			.update(tasks)
			.set({ subtasks: subs, updatedAt: new Date() })
			.where(eq(tasks.id, taskId));
		return { outOfRange: false as const };
	});
	if (!result)
		return Response.json({ error: "Task not found" }, { status: 404 });
	if (result.outOfRange) {
		return Response.json(
			{
				error: `subtaskIndex ${subtaskIndex} out of range (0-${result.size - 1})`,
			},
			{ status: 400 },
		);
	}

	return Response.json({ taskId, subtaskIndex, status });
}
