import { createServerFn } from "@tanstack/react-start";
import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";
import { requireUserServer } from "@/lib/session";

// Ask entry decision for existing-codebase projects (unit-tested in
// src/features/greenfield/tests/ask-entry.test.ts): without a ready analysis the
// generic Ask flow would run without codebase context, so those projects are
// routed to /codebases/$id until analysis is ready. Greenfield and unknown
// modes always enter.
export function decideAskEntry(
	projectMode: string | null | undefined,
	hasReadyAnalysis: boolean,
): "allow" | "redirect-codebase" {
	if (projectMode === "existing_codebase" && !hasReadyAnalysis) {
		return "redirect-codebase";
	}
	return "allow";
}

// ponytail: requireUserServer is a server fn → its auth/db imports get pruned
// from the client bundle. Plain `requireUser` would drag pg (→ Buffer) in.
export const loadAsk = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebaseAnalyses, prdVersions, projects } = await import(
			"@/db/schema"
		);
		const { and, desc, eq, isNull } = await import("drizzle-orm");

		const [projectRows, prdRow] = await Promise.all([
			db
				.select({
					id: projects.id,
					name: projects.name,
					step: projects.step,
					projectMode: projects.projectMode,
					codebaseId: projects.codebaseId,
				})
				.from(projects)
				.where(
					and(
						eq(projects.id, id),
						eq(projects.userId, user.id),
						isNull(projects.deletedAt),
					),
				)
				.limit(1),
			db
				.select({ id: prdVersions.id })
				.from(prdVersions)
				.where(eq(prdVersions.projectId, id))
				.limit(1),
		]);

		const project = projectRows[0];
		if (!project) throw new Error("NOT_FOUND");
		const hasPrd = Boolean(prdRow[0]);

		let hasReadyAnalysis = false;
		let readyAnalysis: CodebaseAnalysis | null = null;
		if (project.projectMode === "existing_codebase") {
			const [analysis] = await db
				.select({
					id: codebaseAnalyses.id,
					output: codebaseAnalyses.output,
				})
				.from(codebaseAnalyses)
				.where(
					and(
						eq(codebaseAnalyses.projectId, id),
						eq(codebaseAnalyses.status, "ready"),
					),
				)
				.orderBy(desc(codebaseAnalyses.createdAt))
				.limit(1);
			hasReadyAnalysis = !!analysis;
			if (analysis?.output) {
				// cast boundary: codebase_analyses.output is untyped jsonb; the
				// analysis write path stores a CodebaseAnalysis document.
				readyAnalysis = analysis.output as CodebaseAnalysis;
			}
		}

		const { getAskHandoff } = await import(
			"@/features/codebase/services/generation-context"
		);
		const loadedHandoff = await getAskHandoff(id, user.id);
		let savedHandoff = loadedHandoff;
		if (!savedHandoff) {
			savedHandoff = {
				projectId: project.id,
				answers: [],
				state: {
					prompt: project.name,
					platform: "web" as const,
					session: 1 as const,
					questions: [],
				},
			};
		}

		return {
			projectId: project.id,
			projectName: project.name,
			step: project.step ?? null,
			projectMode: project.projectMode,
			codebaseId: project.codebaseId ?? null,
			hasReadyAnalysis,
			readyAnalysis,
			savedHandoff,
			hasPrd,
		};
	});
