import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { requireUserServer } from "@/lib/session";

export const existingCodebaseKanbanInputSchema = z.object({
	codebaseId: z.string().min(1).max(128),
	projectId: z.string().min(1).max(128),
});

type ExistingCodebaseKanbanAccessInput = {
	userId: string | null;
	codebase: { userId: string } | null;
	project: { userId: string; codebaseId: string | null } | null;
	requestedCodebaseId: string;
};

export function decideExistingCodebaseKanbanAccess({
	userId,
	codebase,
	project,
	requestedCodebaseId,
}: ExistingCodebaseKanbanAccessInput): "allow" | "deny" {
	if (!userId || !codebase || !project) return "deny";
	if (codebase.userId !== userId || project.userId !== userId) return "deny";
	return project.codebaseId === requestedCodebaseId ? "allow" : "deny";
}

const loadExistingCodebaseKanban = createServerFn({ method: "GET" })
	.validator((input: { codebaseId: string; projectId: string }) =>
		existingCodebaseKanbanInputSchema.parse(input),
	)
	.handler(async ({ data }) => {
		const user = await requireUserServer();
		const { getUserPlanAndQuota } = await import("@/lib/session");
		const { hasFullWorkflow } = await import("@/lib/credits");
		const { db } = await import("@/db");
		const { codebases, projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { plan } = await getUserPlanAndQuota();
		if (!hasFullWorkflow(plan)) {
			throw redirect({
				to: "/prd/$id",
				params: { id: data.projectId },
				search: { paywall: "kanban" },
			});
		}

		const [codebase] = await db
			.select({
				id: codebases.id,
				userId: codebases.userId,
				name: codebases.name,
			})
			.from(codebases)
			.where(
				and(eq(codebases.id, data.codebaseId), eq(codebases.userId, user.id)),
			)
			.limit(1);
		const [project] = await db
			.select({
				id: projects.id,
				userId: projects.userId,
				codebaseId: projects.codebaseId,
				name: projects.name,
			})
			.from(projects)
			.where(
				and(
					eq(projects.id, data.projectId),
					eq(projects.userId, user.id),
					eq(projects.codebaseId, data.codebaseId),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);

		if (
			decideExistingCodebaseKanbanAccess({
				userId: user.id,
				codebase,
				project,
				requestedCodebaseId: data.codebaseId,
			}) !== "allow"
		) {
			throw notFound();
		}

		const [{ getLatestPrdContent }, { getLatestAcContent }] = await Promise.all(
			[
				import("@/lib/services/prd-service"),
				import("@/lib/services/ac-service"),
			],
		);
		const [latestPrdContent, latestAcContent] = await Promise.all([
			getLatestPrdContent(project.id),
			getLatestAcContent(project.id),
		]);

		return {
			codebaseId: codebase.id,
			codebaseName: codebase.name,
			projectId: project.id,
			projectName: project.name,
			latestPrdContent: latestPrdContent ?? null,
			latestAcContent: latestAcContent ?? null,
		};
	});

export const Route = createFileRoute(
	"/codebases/kanban/$codebaseId/$projectId",
)({
	loader: async ({ params }) => {
		try {
			return await loadExistingCodebaseKanban({
				data: {
					codebaseId: params.codebaseId,
					projectId: params.projectId,
				},
			});
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized") {
				throw redirect({ to: "/login" });
			}
			throw error;
		}
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "Kanban"} · ${loaderData?.codebaseName ?? "Repository"}`,
			},
		],
	}),
	component: ExistingCodebaseKanbanPage,
	errorComponent: ({ error, reset }) => (
		<main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
			<div
				role="alert"
				className="rounded-xl border border-crimson/40 bg-crimson/10 p-5 text-crimson"
			>
				<h1 className="text-lg font-semibold">Kanban tidak dapat dimuat</h1>
				<p className="mt-1 text-sm">
					{error instanceof Error && error.message === "NOT_FOUND"
						? "Repository atau project tidak ditemukan."
						: "Terjadi masalah saat membaca data Kanban."}
				</p>
				<button
					type="button"
					onClick={reset}
					className="mt-4 min-h-11 rounded-md border border-crimson/50 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	),
});

function ExistingCodebaseKanbanPage() {
	const data = Route.useLoaderData();
	return (
		<KanbanBoard
			projectId={data.projectId}
			projectName={data.projectName}
			latestPrdContent={data.latestPrdContent}
			latestAcContent={data.latestAcContent}
			navigationContext={{
				codebaseId: data.codebaseId,
				codebaseName: data.codebaseName,
			}}
		/>
	);
}
