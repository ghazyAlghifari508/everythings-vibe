import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectFeatureTree } from "@/db/schema";
import {
	parseVersionRows,
	selectLatestVersionContent,
} from "@/features/codebase/components/explorer/codebase-markdown";
import {
	loadFeatureTree,
	loadTaskTree,
} from "@/features/codebase/services/workspace-artifacts.functions";
import {
	type ArtifactHydrationStatus,
	type ArtifactKind,
	emptyArtifactHydration,
	type WorkspaceArtifactHydration,
} from "@/features/codebase/services/workspace-hydration";
import { describeArtifactReadFailure } from "@/features/codebase/utils/workspace-contracts";
import type { TaskTree } from "@/features/greenfield/services/task-tree";

export function useWorkspaceArtifacts(
	snapshotReady: boolean,
	effectiveFeatureId: string | null,
) {
	const [prdContent, setPrdContent] = useState<string | null>(null);
	const [prdLoading, setPrdLoading] = useState(false);
	const [prdError, setPrdError] = useState<string | null>(null);
	const [acContent, setAcContent] = useState<string | null>(null);
	const [acLoading, setAcLoading] = useState(false);
	const [acError, setAcError] = useState<string | null>(null);
	const [featureTree, setFeatureTree] = useState<ProjectFeatureTree | null>(
		null,
	);
	const [taskTree, setTaskTree] = useState<TaskTree | null>(null);
	const [artifactHydration, setArtifactHydration] =
		useState<WorkspaceArtifactHydration>(emptyArtifactHydration);
	const markArtifact = useCallback(
		(kind: ArtifactKind, status: ArtifactHydrationStatus) => {
			setArtifactHydration((current) =>
				current[kind] === status ? current : { ...current, [kind]: status },
			);
		},
		[],
	);
	// Every read belongs to the plan that started it, including late failures.
	const activeProjectIdRef = useRef<string | null>(effectiveFeatureId);
	activeProjectIdRef.current = effectiveFeatureId;
	useEffect(
		() => () => {
			activeProjectIdRef.current = null;
		},
		[],
	);

	const loadPrd = useCallback(async (): Promise<string | null> => {
		if (!snapshotReady || !effectiveFeatureId) {
			setPrdContent(null);
			setPrdError(null);
			setPrdLoading(false);
			markArtifact("prd", "pending");
			return null;
		}
		setPrdLoading(true);
		setPrdError(null);
		markArtifact("prd", "pending");
		const requestedProjectId = effectiveFeatureId;
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(requestedProjectId)}/versions`,
			);
			const body: unknown = await response.json().catch(() => null);
			if (activeProjectIdRef.current !== requestedProjectId) return null;
			if (!response.ok) {
				setPrdError(
					describeArtifactReadFailure("Dokumen PRD", response.status),
				);
				setPrdContent(null);
				markArtifact("prd", "failed");
				return null;
			}
			const rows = parseVersionRows(body);
			if (!rows) {
				setPrdError("Dokumen PRD tidak valid.");
				setPrdContent(null);
				markArtifact("prd", "failed");
				return null;
			}
			const content = selectLatestVersionContent(rows);
			setPrdContent(content);
			markArtifact("prd", content ? "ready" : "empty");
			return content;
		} catch {
			if (activeProjectIdRef.current !== requestedProjectId) return null;
			setPrdError("Server tidak dapat dihubungi.");
			setPrdContent(null);
			markArtifact("prd", "failed");
			return null;
		} finally {
			if (activeProjectIdRef.current === requestedProjectId)
				setPrdLoading(false);
		}
	}, [snapshotReady, effectiveFeatureId, markArtifact]);
	useEffect(() => {
		void loadPrd();
	}, [loadPrd]);

	const loadAc = useCallback(async (): Promise<string | null> => {
		if (!snapshotReady || !effectiveFeatureId) {
			setAcContent(null);
			setAcError(null);
			setAcLoading(false);
			markArtifact("ac", "pending");
			return null;
		}
		setAcLoading(true);
		setAcError(null);
		markArtifact("ac", "pending");
		const requestedProjectId = effectiveFeatureId;
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(requestedProjectId)}/ac-versions`,
			);
			const body: unknown = await response.json().catch(() => null);
			if (activeProjectIdRef.current !== requestedProjectId) return null;
			if (!response.ok) {
				setAcError(describeArtifactReadFailure("Dokumen AC", response.status));
				setAcContent(null);
				markArtifact("ac", "failed");
				return null;
			}
			const rows = parseVersionRows(body);
			if (!rows) {
				setAcError("Dokumen AC tidak valid.");
				setAcContent(null);
				markArtifact("ac", "failed");
				return null;
			}
			const content = selectLatestVersionContent(rows);
			setAcContent(content);
			markArtifact("ac", content ? "ready" : "empty");
			return content;
		} catch {
			if (activeProjectIdRef.current !== requestedProjectId) return null;
			setAcError("Server tidak dapat dihubungi.");
			setAcContent(null);
			markArtifact("ac", "failed");
			return null;
		} finally {
			if (activeProjectIdRef.current === requestedProjectId)
				setAcLoading(false);
		}
	}, [snapshotReady, effectiveFeatureId, markArtifact]);
	useEffect(() => {
		void loadAc();
	}, [loadAc]);

	const refreshFeatureTree = useCallback(
		async (projectId: string | null) => {
			if (!projectId) {
				setFeatureTree(null);
				markArtifact("feature", "pending");
				return null;
			}
			markArtifact("feature", "pending");
			try {
				const data = await loadFeatureTree({ data: projectId });
				if (activeProjectIdRef.current !== projectId) return null;
				setFeatureTree(data.featureTree);
				markArtifact("feature", data.featureTree ? "ready" : "empty");
				return data.featureTree;
			} catch {
				if (activeProjectIdRef.current !== projectId) return null;
				setFeatureTree(null);
				markArtifact("feature", "failed");
				return null;
			}
		},
		[markArtifact],
	);
	const refreshTaskTree = useCallback(
		async (projectId: string | null) => {
			if (!projectId) {
				setTaskTree(null);
				markArtifact("tasks", "pending");
				return null;
			}
			markArtifact("tasks", "pending");
			try {
				const data = await loadTaskTree({ data: projectId });
				if (activeProjectIdRef.current !== projectId) return null;
				setTaskTree(data.taskTree);
				markArtifact("tasks", data.taskTree ? "ready" : "empty");
				return data.taskTree;
			} catch {
				if (activeProjectIdRef.current !== projectId) return null;
				setTaskTree(null);
				markArtifact("tasks", "failed");
				return null;
			}
		},
		[markArtifact],
	);
	useEffect(() => {
		void refreshFeatureTree(effectiveFeatureId);
		void refreshTaskTree(effectiveFeatureId);
	}, [effectiveFeatureId, refreshFeatureTree, refreshTaskTree]);

	return {
		prdContent,
		setPrdContent,
		prdLoading,
		prdError,
		setPrdError,
		acContent,
		setAcContent,
		acLoading,
		acError,
		setAcError,
		featureTree,
		setFeatureTree,
		taskTree,
		setTaskTree,
		artifactHydration,
		setArtifactHydration,
		activeProjectIdRef,
		loadPrd,
		loadAc,
		refreshFeatureTree,
		refreshTaskTree,
	};
}
