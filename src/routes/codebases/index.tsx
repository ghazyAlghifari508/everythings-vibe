import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { CodebaseLibraryView } from "@/components/codebase/codebase-library-view";
import {
	buildCodebaseLibraryItems,
	type CodebaseLibraryItem,
} from "@/lib/codebase-library";
import { requireUserServer } from "@/lib/session";

export {
	selectLatestCodebaseSnapshots,
	selectLibraryAnalysisSlice,
	selectNewestFeatureProjectIdPerCodebase,
} from "@/lib/codebase-library";

export function decideCodebaseListEntry(): "allow" {
	return "allow";
}

export type CodebaseLibraryRow = CodebaseLibraryItem;

const loadCodebases = createServerFn({ method: "GET" }).handler(async () => {
	const user = await requireUserServer();
	const rows = await dbSelectCodebases(user.id);
	return { codebases: rows };
});

async function dbSelectCodebases(
	userId: string,
): Promise<CodebaseLibraryRow[]> {
	const { db } = await import("@/db");
	const { codebaseAnalyses, codebaseSnapshots, codebases, projects } =
		await import("@/db/schema");
	const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
	const rows = await db
		.select({
			id: codebases.id,
			name: codebases.name,
			createdAt: codebases.createdAt,
			updatedAt: codebases.updatedAt,
		})
		.from(codebases)
		.where(eq(codebases.userId, userId))
		.orderBy(desc(codebases.updatedAt));
	const ids = rows.map((row) => row.id);
	const snapshots = ids.length
		? await db
				.select({
					id: codebaseSnapshots.id,
					codebaseId: codebaseSnapshots.codebaseId,
					createdAt: codebaseSnapshots.createdAt,
					commitSha: codebaseSnapshots.commitSha,
					fileCount: codebaseSnapshots.fileCount,
					status: codebaseSnapshots.status,
				})
				.from(codebaseSnapshots)
				.where(inArray(codebaseSnapshots.codebaseId, ids))
				.orderBy(desc(codebaseSnapshots.createdAt))
		: [];
	const featureRows = ids.length
		? await db
				.select({
					id: projects.id,
					codebaseId: projects.codebaseId,
					updatedAt: projects.updatedAt,
				})
				.from(projects)
				.where(
					and(
						inArray(projects.codebaseId, ids),
						eq(projects.userId, userId),
						isNull(projects.deletedAt),
					),
				)
				.orderBy(desc(projects.updatedAt))
		: [];
	const projectIds = featureRows.map((row) => row.id);
	const analysisRows = projectIds.length
		? await db
				.select({
					id: codebaseAnalyses.id,
					projectId: codebaseAnalyses.projectId,
					snapshotId: codebaseAnalyses.snapshotId,
					status: codebaseAnalyses.status,
					output: codebaseAnalyses.output,
					createdAt: codebaseAnalyses.createdAt,
				})
				.from(codebaseAnalyses)
				.where(inArray(codebaseAnalyses.projectId, projectIds))
				.orderBy(desc(codebaseAnalyses.createdAt))
		: [];
	return buildCodebaseLibraryItems({
		codebases: rows,
		snapshots,
		projects: featureRows,
		analyses: analysisRows,
	});
}

export const Route = createFileRoute("/codebases/")({
	loader: async () => {
		try {
			return await loadCodebases();
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw error;
		}
	},
	head: () => ({
		meta: [
			{ title: "Project Tersimpan | VibeEverything" },
			{
				name: "description",
				content:
					"Repository yang pernah kamu hubungkan akan tersimpan di sini. Lanjutkan dari konteks dan workspace sebelumnya.",
			},
		],
	}),
	component: CodebasesPage,
	pendingComponent: CodebasesPending,
	errorComponent: ({ reset }) => (
		<main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-12 sm:px-6">
			<div
				role="alert"
				className="rounded-xl border border-crimson/40 bg-crimson/10 p-5 text-crimson"
			>
				<h1 className="text-lg font-semibold">
					Project tersimpan gagal dimuat
				</h1>
				<p className="mt-1 text-sm">
					Periksa koneksi lalu coba muat ulang daftar project tersimpan.
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

function CodebasesPending() {
	return (
		<main
			className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14"
			aria-busy="true"
		>
			<header className="flex flex-col gap-4 border-b border-graphite pb-6 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="h-3 w-36 animate-pulse rounded bg-graphite" />
					<div className="mt-3 h-10 w-64 animate-pulse rounded bg-graphite" />
					<div className="mt-3 h-4 max-w-xl animate-pulse rounded bg-graphite" />
				</div>
				<div className="h-11 w-44 animate-pulse rounded-md bg-graphite/40" />
			</header>
			<div className="flex flex-col gap-3">
				{["one", "two", "three"].map((row) => (
					<div
						key={row}
						className="h-32 animate-pulse rounded-xl border border-graphite bg-charcoal/60"
					/>
				))}
			</div>
			<p className="text-sm text-fog">Memuat project tersimpan...</p>
		</main>
	);
}

function CodebasesPage() {
	const { codebases: items } = Route.useLoaderData();
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<CodebaseLibraryView items={items} />
		</main>
	);
}
