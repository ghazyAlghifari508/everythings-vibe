import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodebaseAnalysis } from "@/lib/codebase-analysis";
import {
	detectStackFromPackageJsonText,
	manifestToExplorerFiles,
	mergeStackWithFallback,
} from "@/lib/codebase-stack";
import {
	loadSnapshotFileContent,
	loadSnapshotManifest,
} from "../services/workspace-snapshot.functions";
import {
	type SourcePreviewState,
	toSourcePreviewState,
} from "../types/source-preview";

export function useWorkspaceSource({
	codebaseId,
	snapshotReady,
	polledSnapshotId,
	analysisOutput,
	setActiveArtifactId,
	setCanvasOpen,
}: {
	codebaseId: string;
	snapshotReady: boolean;
	polledSnapshotId: string | null | undefined;
	analysisOutput: CodebaseAnalysis | null;
	setActiveArtifactId: (id: string | null) => void;
	setCanvasOpen: (open: boolean) => void;
}) {
	const [manifestFiles, setManifestFiles] = useState<Array<{ path: string }>>(
		[],
	);
	const [manifestFileCount, setManifestFileCount] = useState<number | null>(
		null,
	);
	const [packageJsonText, setPackageJsonText] = useState<string | null>(null);
	const [manifestSnapshotId, setManifestSnapshotId] = useState<string | null>(
		null,
	);
	const [sourcePreview, setSourcePreview] = useState<SourcePreviewState>({
		kind: "idle",
	});
	useEffect(() => {
		if (!snapshotReady) return;
		let cancelled = false;
		void (async () => {
			try {
				const data = await loadSnapshotManifest({ data: codebaseId });
				if (cancelled) return;
				setManifestFiles(data.files ?? []);
				setManifestSnapshotId(data.snapshotId ?? null);
				setManifestFileCount(
					typeof data.fileCount === "number" ? data.fileCount : null,
				);
				setPackageJsonText(data.packageJsonText ?? null);
			} catch {
				if (!cancelled) {
					setManifestFiles([]);
					setManifestSnapshotId(null);
					setManifestFileCount(null);
					setPackageJsonText(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [snapshotReady, codebaseId]);
	const sourcePreviewRequestRef = useRef(0);
	const activeSnapshotId = polledSnapshotId ?? manifestSnapshotId;
	const appliedSnapshotRef = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		if (appliedSnapshotRef.current === activeSnapshotId) return;
		appliedSnapshotRef.current = activeSnapshotId;
		sourcePreviewRequestRef.current += 1;
		setSourcePreview({ kind: "idle" });
		setActiveArtifactId(null);
	}, [activeSnapshotId, setActiveArtifactId]);
	const selectSourceFile = useCallback(
		(path: string) => {
			const requestId = sourcePreviewRequestRef.current + 1;
			sourcePreviewRequestRef.current = requestId;
			setActiveArtifactId(null);
			setSourcePreview({ kind: "loading", path });
			setCanvasOpen(true);
			void (async () => {
				try {
					const result = await loadSnapshotFileContent({
						data: { codebaseId, path },
					});
					if (sourcePreviewRequestRef.current !== requestId) return;
					if (
						result.status === "ok" &&
						result.snapshotId !== activeSnapshotId
					) {
						setSourcePreview({ kind: "idle" });
						setCanvasOpen(false);
						return;
					}
					setSourcePreview(toSourcePreviewState(result, path));
				} catch {
					if (sourcePreviewRequestRef.current !== requestId) return;
					setSourcePreview({
						kind: "failed",
						path,
						message: "Pratinjau file tidak dapat dimuat.",
					});
				}
			})();
		},
		[codebaseId, activeSnapshotId, setActiveArtifactId, setCanvasOpen],
	);
	const clearSourcePreview = useCallback(() => {
		sourcePreviewRequestRef.current += 1;
		setSourcePreview({ kind: "idle" });
	}, []);
	const explorerFiles = useMemo(() => {
		if (manifestFiles.length > 0) return manifestFiles;
		return manifestToExplorerFiles(analysisOutput?.relevantFiles ?? []);
	}, [manifestFiles, analysisOutput]);
	const explorerStack = useMemo(() => {
		const fromPackageJson = detectStackFromPackageJsonText(packageJsonText);
		const raw = analysisOutput
			? [
					analysisOutput.framework,
					analysisOutput.language,
					analysisOutput.database,
					analysisOutput.auth,
					analysisOutput.packageManager,
					...(analysisOutput.dependencies ?? []).slice(0, 5),
				].filter(
					(value): value is string =>
						typeof value === "string" &&
						value.trim().length > 0 &&
						value.trim() !== "Tidak terdeteksi",
				)
			: [];
		return mergeStackWithFallback(fromPackageJson, raw);
	}, [packageJsonText, analysisOutput]);
	const contextFiles = useMemo(
		() => (analysisOutput?.relevantFiles ?? []).slice(0, 2),
		[analysisOutput],
	);
	return {
		manifestFileCount,
		sourcePreview,
		selectSourceFile,
		clearSourcePreview,
		explorerFiles,
		explorerStack,
		contextFiles,
	};
}
