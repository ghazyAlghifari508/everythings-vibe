import type { ProjectFeatureTree } from "@/db/schema";
import { CodebaseDocPreview } from "@/features/codebase/components/explorer/codebase-doc-preview";
import { CodebaseSourcePreview } from "@/features/codebase/components/explorer/codebase-source-preview";
import { CodebaseKanbanBoard } from "@/features/codebase/components/planning/codebase-kanban-board";
import { FeatureMapCanvas } from "@/features/greenfield/components/feature-tree/feature-map-canvas";
import { WhiteboardCanvas } from "@/features/greenfield/components/whiteboard/whiteboard-canvas";
import type { useKanbanTasks } from "@/features/greenfield/hooks/use-kanban-polling";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import type { SourcePreviewState } from "../../types/source-preview";
import { WorkspaceTaskSubnav } from "./workspace-task-subnav";

export function WorkspaceScreenResolver({
	sourcePreview,
	activeArtifact,
	resolvedFeature,
	isPrdArtifactActive,
	isAcArtifactActive,
	isTasksArtifactActive,
	isFeatureArtifactActive,
	prdContent,
	acContent,
	canvasView,
	setCanvasView,
	codebaseId,
	kanban,
	canOpenFullBoard,
	taskTree,
	featureTree,
	snapshotId,
	impactAreas,
}: {
	sourcePreview: SourcePreviewState;
	activeArtifact: { id: string } | null;
	resolvedFeature: { id: string; name: string } | null;
	isPrdArtifactActive: boolean;
	isAcArtifactActive: boolean;
	isTasksArtifactActive: boolean;
	isFeatureArtifactActive: boolean;
	prdContent: string | null;
	acContent: string | null;
	canvasView: "kanban" | "checklist";
	setCanvasView: (view: "kanban" | "checklist") => void;
	codebaseId: string;
	kanban: ReturnType<typeof useKanbanTasks>;
	canOpenFullBoard: boolean;
	taskTree: TaskTree | null;
	featureTree: ProjectFeatureTree | null;
	snapshotId: string | null | undefined;
	impactAreas: string[] | undefined;
}) {
	if (sourcePreview.kind !== "idle") {
		if (sourcePreview.kind === "ready")
			return (
				<CodebaseSourcePreview
					key={sourcePreview.path}
					path={sourcePreview.path}
					content={sourcePreview.content}
					truncated={sourcePreview.truncated}
					sizeBytes={sourcePreview.sizeBytes}
				/>
			);
		if (sourcePreview.kind === "unsupported")
			return (
				<div
					data-testid="codebase-source-unsupported"
					className="flex h-full flex-col items-start justify-center gap-2 p-2"
				>
					<p className="text-sm font-semibold text-snow">
						Pratinjau tidak tersedia
					</p>
					<p className="max-w-sm text-xs leading-5 text-fog">
						{sourcePreview.path} bukan berkas teks atau melebihi batas tampilan.
						Buka di repository lokal untuk membacanya.
					</p>
				</div>
			);
		if (sourcePreview.kind === "unavailable")
			return (
				<div
					data-testid="codebase-source-unavailable"
					className="flex h-full flex-col items-start justify-center gap-2 p-2"
				>
					<p className="text-sm font-semibold text-snow">
						File tidak ada di snapshot ini
					</p>
					<p className="max-w-sm text-xs leading-5 text-fog">
						{sourcePreview.path} tidak pernah ter-sync, atau snapshot sudah
						diganti. Sinkronkan ulang repository untuk melihat isinya.
					</p>
				</div>
			);
		return null;
	}
	if (!activeArtifact || !resolvedFeature)
		return (
			<div className="flex h-full flex-col items-start justify-center gap-3 p-2">
				<p className="text-sm font-semibold text-snow">
					Belum ada artefak terpilih
				</p>
				<p className="max-w-sm text-xs leading-5 text-fog">
					Pilih file di panel kiri untuk membaca sourcecode, atau FileCard di
					kolom chat untuk preview dokumen atau papan Kanban langsung di sini.
				</p>
			</div>
		);
	if (isPrdArtifactActive)
		return prdContent ? <CodebaseDocPreview content={prdContent} /> : null;
	if (isAcArtifactActive)
		return acContent ? <CodebaseDocPreview content={acContent} /> : null;
	if (isTasksArtifactActive)
		return (
			<WorkspaceTaskSubnav
				canvasView={canvasView}
				setCanvasView={setCanvasView}
			>
				{canvasView === "kanban" ? (
					<CodebaseKanbanBoard
						projectId={resolvedFeature.id}
						codebaseId={codebaseId}
						columns={kanban.data?.columns ?? null}
						staleness={kanban.staleness}
						isLoadingExternal={kanban.isLoading}
						isErrorExternal={kanban.isError}
						onRetryExternal={() => void kanban.refetch()}
						canOpenFullBoard={canOpenFullBoard}
					/>
				) : (
					<div data-testid="codebase-checklist-tree" className="h-full min-h-0">
						<WhiteboardCanvas
							projectName={resolvedFeature.name}
							taskTree={taskTree}
							featureTree={featureTree}
						/>
					</div>
				)}
			</WorkspaceTaskSubnav>
		);
	if (isFeatureArtifactActive)
		return (
			<div className="h-full min-h-0">
				<FeatureMapCanvas
					productName={resolvedFeature.name}
					featureTree={featureTree}
				/>
			</div>
		);
	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-lg border border-graphite bg-charcoal p-3">
				<p className="font-mono text-[11px] uppercase tracking-wider text-slate">
					Fitur
				</p>
				<p className="mt-1 text-sm font-semibold text-snow">
					{resolvedFeature.name}
				</p>
				<p className="mt-1 font-mono text-[11px] text-fog">
					Project: {resolvedFeature.id}
				</p>
				{snapshotId ? (
					<p className="mt-1 font-mono text-[11px] text-fog">
						Snapshot: {snapshotId}
					</p>
				) : null}
			</div>
			{impactAreas && impactAreas.length > 0 ? (
				<div className="rounded-lg border border-graphite bg-charcoal p-3">
					<p className="font-mono text-[11px] uppercase tracking-wider text-slate">
						Area dampak terdeteksi
					</p>
					<ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs leading-5 text-fog">
						{impactAreas.map((area) => (
							<li key={area}>{area}</li>
						))}
					</ul>
				</div>
			) : null}
			<p className="text-xs leading-5 text-fog">
				Jawab pertanyaan klarifikasi di kolom chat, lalu pilih Lanjut Bikin
				Fitur untuk menyusun spesifikasi.
			</p>
		</div>
	);
}
