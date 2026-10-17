import { KanbanBoard } from "@/features/greenfield/components/kanban/kanban-board";

/**
 * The existing-codebase Kanban page shell for
 * `/codebases/kanban/$codebaseId/$projectId`.
 *
 * The board is the canonical `KanbanBoard`; this module only carries the loader
 * payload into it plus the failure state the route declares.
 */

type ExistingCodebaseKanbanData = {
	codebaseId: string;
	codebaseName: string;
	projectId: string;
	projectName: string;
	latestPrdContent: string | null;
	latestAcContent: string | null;
};

export function ExistingCodebaseKanbanPage({
	data,
}: {
	data: ExistingCodebaseKanbanData;
}) {
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

export function ExistingCodebaseKanbanError({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	return (
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
					onClick={onRetry}
					className="mt-4 min-h-11 rounded-md border border-crimson/50 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	);
}
