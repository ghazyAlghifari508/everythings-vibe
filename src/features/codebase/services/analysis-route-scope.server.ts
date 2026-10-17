// Server-only read/ownership primitives shared by the codebase analysis
// trigger and read handlers (`/api/v1/projects/$id/codebase/analysis`).
//
// Never import this module from client code: it imports the database client
// and `subscriptions` to resolve the caller's plan for rate limiting.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	codebaseAnalyses,
	codebaseSyncSessions,
	codebases,
	subscriptions,
} from "@/db/schema";
import type { Plan } from "@/types/database";
import {
	type AnalysisResponse,
	type AnalysisScope,
	analysisResponseSchema,
	codebaseAnalysisSchema,
	resolveAnalysisScope,
} from "./analysis";

export type AnalysisRow = typeof codebaseAnalyses.$inferSelect;

export type AnalysisProject = {
	id: string;
	projectMode: string | null;
	codebaseId: string | null;
	userId: string;
};

export async function resolveProjectAnalysisScope(
	project: AnalysisProject,
	authenticatedUserId: string,
) {
	let codebaseOwnerId: string | null | undefined;
	if (project.codebaseId) {
		const [codebase] = await db
			.select({ userId: codebases.userId })
			.from(codebases)
			.where(eq(codebases.id, project.codebaseId))
			.limit(1);
		codebaseOwnerId = codebase?.userId;
	}
	return resolveAnalysisScope({
		projectId: project.id,
		projectMode: project.projectMode,
		projectCodebaseId: project.codebaseId,
		projectUserId: project.userId,
		authenticatedUserId,
		codebaseOwnerId,
	});
}

export function sessionOwnershipCondition(
	scope: AnalysisScope,
	userId: string,
) {
	return scope.kind === "codebase"
		? and(
				eq(codebaseSyncSessions.codebaseId, scope.codebaseId),
				eq(codebaseSyncSessions.userId, userId),
			)
		: and(
				eq(codebaseSyncSessions.projectId, scope.projectId),
				eq(codebaseSyncSessions.userId, userId),
			);
}

function toIso(value: Date | null | undefined): string | undefined {
	return value ? value.toISOString() : undefined;
}

export function toResponse(row: AnalysisRow): AnalysisResponse | null {
	const output =
		row.output == null ? null : codebaseAnalysisSchema.safeParse(row.output);
	if (row.output != null && (!output || !output.success)) return null;
	const response: AnalysisResponse = {
		id: row.id,
		projectId: row.projectId,
		snapshotId: row.snapshotId,
		status: row.status as AnalysisResponse["status"],
		output: output?.success ? output.data : null,
		errorCode: row.errorCode,
		errorMessage: row.errorMessage,
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
	};
	const parsed = analysisResponseSchema.safeParse(response);
	return parsed.success ? parsed.data : null;
}

export async function failRefreshClaim(analysisId: string): Promise<void> {
	await db
		.update(codebaseAnalyses)
		.set({
			status: "failed",
			errorCode: "ANALYSIS_FAILED",
			errorMessage:
				"Analisis codebase gagal. Coba analisis ulang dalam beberapa menit.",
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(codebaseAnalyses.id, analysisId),
				eq(codebaseAnalyses.status, "pending"),
			),
		);
}

export async function resolvePlan(userId: string): Promise<Plan> {
	const [sub] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const rawPlan = sub?.plan || "free";
	return (
		["free", "pro", "hengker"].includes(rawPlan) ? rawPlan : "free"
	) as Plan;
}
