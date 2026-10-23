import { useCallback, useMemo } from "react";
import type { ProjectFeatureTree } from "@/db/schema";
import type { CodebaseArtifactRef } from "@/features/codebase/components/explorer/codebase-file-card";
import { stripInternalSectionMarkers } from "@/features/codebase/components/explorer/codebase-markdown";
import {
	artifactMimeTypeFor,
	downloadArtifact,
} from "@/features/codebase/services/download";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import type { SourcePreviewState } from "../types/source-preview";

export function useWorkspaceArtifactPresentation({
	resolvedFeature,
	codebaseName,
	featureTree,
	taskTree,
	prdContent,
	acContent,
	hasTasksInDb,
	activeArtifactId,
	sourcePreview,
}: {
	resolvedFeature: { id: string; name: string } | null;
	codebaseName: string;
	featureTree: ProjectFeatureTree | null;
	taskTree: TaskTree | null;
	prdContent: string | null;
	acContent: string | null;
	hasTasksInDb: boolean;
	activeArtifactId: string | null;
	sourcePreview: SourcePreviewState;
}) {
	const featureSlug = useMemo(() => {
		const base = (resolvedFeature?.name ?? codebaseName)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40);
		return base || "fitur";
	}, [resolvedFeature?.name, codebaseName]);
	const artifacts = useMemo<CodebaseArtifactRef[]>(() => {
		if (!resolvedFeature) return [];
		const list: CodebaseArtifactRef[] = [];
		if (featureTree)
			list.push({
				id: `feature-${resolvedFeature.id}`,
				title: `Spesifikasi Fitur · ${resolvedFeature.name}`,
				fileName: `feature-${featureSlug}.json`,
				fileSizeBytes: new TextEncoder().encode(
					JSON.stringify(featureTree, null, 2),
				).length,
				badge: "FITUR",
				description: "Dokumen siap",
			});
		if (prdContent)
			list.push({
				id: `prd-${resolvedFeature.id}`,
				title: `PRD · ${resolvedFeature.name}`,
				fileName: `PRD-${featureSlug}.md`,
				fileSizeBytes: new TextEncoder().encode(
					stripInternalSectionMarkers(prdContent),
				).length,
				badge: "MARKDOWN",
				description: "Dokumen siap",
			});
		if (acContent)
			list.push({
				id: `ac-${resolvedFeature.id}`,
				title: `Acceptance Criteria · ${resolvedFeature.name}`,
				fileName: `AC-${featureSlug}.md`,
				fileSizeBytes: new TextEncoder().encode(
					stripInternalSectionMarkers(acContent),
				).length,
				badge: "MARKDOWN",
				description: "Dokumen siap",
			});
		if (hasTasksInDb)
			list.push({
				id: `tasks-${resolvedFeature.id}`,
				title: `Task · ${resolvedFeature.name}`,
				fileName: `tasks-${featureSlug}.json`,
				fileSizeBytes: taskTree
					? new TextEncoder().encode(JSON.stringify(taskTree, null, 2)).length
					: null,
				badge: "TASK",
				description: "Dokumen siap",
			});
		return list;
	}, [
		resolvedFeature,
		featureTree,
		featureSlug,
		hasTasksInDb,
		prdContent,
		acContent,
		taskTree,
	]);
	const activeArtifact =
		artifacts.find((item) => item.id === activeArtifactId) ?? null;
	const isSourcePreviewOpen = sourcePreview.kind !== "idle";
	const sourcePreviewPath =
		sourcePreview.kind === "idle" ? "" : sourcePreview.path;
	const isPrdArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `prd-${resolvedFeature.id}`;
	const isAcArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `ac-${resolvedFeature.id}`;
	const isFeatureArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `feature-${resolvedFeature.id}`;
	const isTasksArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `tasks-${resolvedFeature.id}`;
	const canvasCopy = useMemo((): {
		value: string | null;
		label?: string;
		unavailableReason?: string;
	} => {
		if (isSourcePreviewOpen) {
			if (sourcePreview.kind === "ready")
				return sourcePreview.truncated
					? {
							value: null,
							label: "Salin isi sumber",
							unavailableReason:
								"Pratinjau dipotong — buka file di repository lokal untuk menyalin isi lengkap.",
						}
					: { value: sourcePreview.content, label: "Salin isi sumber" };
			return { value: null };
		}
		if (!activeArtifact) return { value: null };
		if (activeArtifact.id.startsWith("feature-") && featureTree)
			return { value: JSON.stringify(featureTree, null, 2) };
		if (activeArtifact.id.startsWith("prd-") && prdContent)
			return { value: stripInternalSectionMarkers(prdContent) };
		if (activeArtifact.id.startsWith("ac-") && acContent)
			return { value: stripInternalSectionMarkers(acContent) };
		if (activeArtifact.id.startsWith("tasks-") && taskTree)
			return { value: JSON.stringify(taskTree, null, 2) };
		return { value: null };
	}, [
		isSourcePreviewOpen,
		sourcePreview,
		activeArtifact,
		featureTree,
		prdContent,
		acContent,
		taskTree,
	]);
	const handleDownloadArtifact = useCallback(
		(artifact: CodebaseArtifactRef) => {
			if (!resolvedFeature) return;
			const isJson = artifact.fileName.toLowerCase().endsWith(".json");
			if (isJson) {
				if (artifact.id.startsWith("feature-") && featureTree)
					downloadArtifact({
						fileName: artifact.fileName,
						content: JSON.stringify(featureTree, null, 2),
						mimeType: artifactMimeTypeFor(artifact.fileName),
					});
				if (artifact.id.startsWith("tasks-") && taskTree)
					downloadArtifact({
						fileName: artifact.fileName,
						content: JSON.stringify(taskTree, null, 2),
						mimeType: artifactMimeTypeFor(artifact.fileName),
					});
				return;
			}
			if (artifact.id.startsWith("prd-") && prdContent)
				downloadArtifact({
					fileName: artifact.fileName,
					content: stripInternalSectionMarkers(prdContent),
					mimeType: artifactMimeTypeFor(artifact.fileName),
				});
			if (artifact.id.startsWith("ac-") && acContent)
				downloadArtifact({
					fileName: artifact.fileName,
					content: stripInternalSectionMarkers(acContent),
					mimeType: artifactMimeTypeFor(artifact.fileName),
				});
		},
		[resolvedFeature, featureTree, taskTree, prdContent, acContent],
	);
	return {
		artifacts,
		activeArtifact,
		isSourcePreviewOpen,
		sourcePreviewPath,
		isPrdArtifactActive,
		isAcArtifactActive,
		isFeatureArtifactActive,
		isTasksArtifactActive,
		canvasCopy,
		handleDownloadArtifact,
	};
}
