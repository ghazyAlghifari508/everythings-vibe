// Project progress state: monotonic flow-step advancement and task-progress
// reset. Both endpoints mutate progress only — the task set, PRD, AC, and the
// stored document versions are never touched here.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { resolvePlanTier } from "@/features/greenfield/services/plan-tier";
import {
	hasNonPendingSubtask,
	needsProgressReset,
	normalizeSubtasksForReset,
	TASK_STATUS_PENDING,
} from "@/features/greenfield/services/task-reset";
import type { FlowStep } from "@/features/greenfield/utils/flow-step";
import { advanceStep } from "@/lib/flow-progress";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

// ponytail: no DB CHECK constraint on projects.step (migration 0000), so valid
// values live here. "question" added so ask-options success can mark a project
// mid-question-stage server-side - drives History visibility without migration.
const ALLOWED_STEPS = new Set(["question", "fitur", "prd", "ac", "task"]);

function isProjectStep(value: unknown): value is FlowStep {
	return typeof value === "string" && ALLOWED_STEPS.has(value);
}

// Clears task progress only. The task set, PRD, AC, and the project's
// stage are untouched: this exists so the same plan can be handed to
// an agent again without burning a credit on regeneration.
export async function handleProjectResetProgressRequest(
	request: Request,
	params: { id: string },
): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id: projectId } = params;

	const plan = await resolvePlanTier(user.id);
	const rateCheck = await checkRateLimit(user.id, plan, "api_call");
	if (!rateCheck.allowed)
		return Response.json(
			{ error: "Terlalu banyak permintaan", retryAfter: 60 },
			{ status: 429 },
		);

	try {
		const result = await db.transaction(async (tx) => {
			// Ownership is established on the locked project row so a
			// project that disappears or changes hands mid-request can
			// never be reset without revalidation.
			const [project] = await tx
				.select({ id: projects.id })
				.from(projects)
				.where(
					and(
						eq(projects.id, projectId),
						eq(projects.userId, user.id),
						isNull(projects.deletedAt),
					),
				)
				.limit(1)
				.for("update");
			if (!project) return { kind: "not_found" as const };

			// Row lock: concurrent resets serialize here instead of
			// racing on a stale read, and the no-op decision is made
			// on the locked rows.
			const rows = await tx
				.select({
					id: tasks.id,
					status: tasks.status,
					subtasks: tasks.subtasks,
				})
				.from(tasks)
				.where(eq(tasks.projectId, projectId))
				.for("update");

			if (!needsProgressReset(rows)) {
				return { kind: "noop" as const, tasksReset: 0 };
			}

			const now = new Date();
			let tasksReset = 0;
			for (const row of rows) {
				// Change is detected with the raw-value helper:
				// normalizeSubtasksForReset always writes "pending", so
				// inspecting its output could never report a change.
				if (
					row.status === TASK_STATUS_PENDING &&
					!hasNonPendingSubtask(row.subtasks)
				) {
					continue;
				}
				await tx
					.update(tasks)
					.set({
						status: TASK_STATUS_PENDING,
						startedAt: null,
						completedAt: null,
						subtasks: normalizeSubtasksForReset(row.subtasks),
						updatedAt: now,
					})
					.where(and(eq(tasks.id, row.id), eq(tasks.projectId, projectId)));
				tasksReset += 1;
			}
			return { kind: "reset" as const, tasksReset };
		});

		if (result.kind === "not_found")
			return Response.json(
				{ error: "Project tidak ditemukan" },
				{ status: 404 },
			);
		if (result.kind === "noop")
			return Response.json({ reset: false, tasksReset: 0 });
		return Response.json({
			reset: true,
			tasksReset: result.tasksReset,
		});
	} catch (e) {
		console.error("reset-progress handler failed:", e);
		return Response.json({ error: "Gagal mereset progress" }, { status: 500 });
	}
}

// ponytail: step is monotonic - this endpoint fires on navigation intent
// (navbar "Generate AC"), so a user revisiting AC after Task must not
// rewind step and strand History on the AC page. No-op = still 200.
// The row lock serializes concurrent writers so two requests
// reading the same old step cannot overwrite a newer one.
export async function advanceProjectStep(input: {
	projectId: string;
	userId: string;
	step: FlowStep;
}): Promise<{ step: string | null } | null> {
	const { projectId, userId, step } = input;
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ step: projects.step })
			.from(projects)
			.where(
				and(
					eq(projects.id, projectId),
					eq(projects.userId, userId),
					isNull(projects.deletedAt),
				),
			)
			.limit(1)
			.for("update");
		if (!existing) return null;
		const next = advanceStep(existing.step, step);
		if (!next) return { step: existing.step };
		await tx
			.update(projects)
			.set({ step: next })
			.where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
		return { step: next };
	});
}

export async function handleProjectStepRequest(
	request: Request,
	params: { id: string },
): Promise<Response> {
	const user = await requireUser(request.headers);
	const { id: projectId } = params;
	if (!projectId)
		return Response.json({ error: "Project ID is required" }, { status: 400 });

	const body: unknown = await request.json().catch(() => null);
	const step =
		typeof body === "object" && body !== null && "step" in body
			? body.step
			: undefined;
	if (!isProjectStep(step))
		return Response.json({ error: "Invalid step" }, { status: 400 });

	if (step === "ac" || step === "task") {
		const { getUserPlanAndQuota } = await import("@/lib/session");
		const { hasFullWorkflow } = await import(
			"@/features/billing/services/credits"
		);
		const { plan } = await getUserPlanAndQuota();
		if (!hasFullWorkflow(plan)) {
			return Response.json(
				{
					error: "Tahap ini hanya tersedia di paket Pro dan Hengker.",
					code: "UPGRADE_REQUIRED",
				},
				{ status: 403 },
			);
		}
	}

	const result = await advanceProjectStep({ projectId, userId: user.id, step });
	if (!result)
		return Response.json({ error: "Project not found" }, { status: 404 });
	return Response.json({ success: true, step: result.step });
}
