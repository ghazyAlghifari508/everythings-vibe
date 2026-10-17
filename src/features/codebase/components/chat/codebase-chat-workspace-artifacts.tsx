"use client";

import { AlertTriangle } from "lucide-react";
import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import type { ArtifactKind } from "@/features/codebase/services/workspace-hydration";
import {
	type CodebaseArtifactRef,
	CodebaseFileCard,
} from "../explorer/codebase-file-card";

/** Human label per artifact, used when reporting which artifact failed to load. */
const ARTIFACT_LABEL: Record<ArtifactKind, string> = {
	feature: "spesifikasi fitur",
	prd: "PRD",
	ac: "Acceptance Criteria",
	tasks: "task",
};

function artifactLabel(kind: ArtifactKind): string {
	return ARTIFACT_LABEL[kind];
}

interface CodebaseChatWorkspaceArtifactsFailedProps {
	failedArtifacts: readonly ArtifactKind[];
}

export function CodebaseChatWorkspaceArtifactsFailed({
	failedArtifacts,
}: CodebaseChatWorkspaceArtifactsFailedProps) {
	if (failedArtifacts.length === 0) return null;
	return (
		<div
			data-testid="codebase-artifacts-failed"
			className="shrink-0 border-b border-crimson/30 bg-crimson/10 px-4 py-2 text-[11px] text-crimson"
		>
			<span className="inline-flex items-center gap-1.5">
				<AlertTriangle size={12} aria-hidden />
				Sebagian planning tidak dapat dimuat:{" "}
				{failedArtifacts.map(artifactLabel).join(", ")}. Bagian lain tetap
				tersimpan di server.
			</span>
		</div>
	);
}

interface CodebaseChatWorkspaceArtifactStreamProps {
	artifacts: CodebaseArtifactRef[];
	activeArtifactId: string | null;
	stage: CodebasePipelineStage;
	onOpenArtifact?: (artifact: CodebaseArtifactRef) => void;
	onDownloadArtifact?: (artifact: CodebaseArtifactRef) => void;
}

export function CodebaseChatWorkspaceArtifactStream({
	artifacts,
	activeArtifactId,
	stage,
	onOpenArtifact,
	onDownloadArtifact,
}: CodebaseChatWorkspaceArtifactStreamProps) {
	/**
	 * Artifact the active stage handoff already renders. Every other artifact
	 * still lists in the stream, so a finished file stays reachable without the
	 * same card appearing twice.
	 */
	const handoffArtifactPrefix =
		stage === "feature"
			? "feature-"
			: stage === "prd"
				? "prd-"
				: stage === "ac"
					? "ac-"
					: null;
	const streamArtifacts = handoffArtifactPrefix
		? artifacts.filter((item) => !item.id.startsWith(handoffArtifactPrefix))
		: artifacts;

	if (streamArtifacts.length === 0) return null;
	return (
		<div className="flex flex-col">
			{streamArtifacts.map((artifact) => (
				<CodebaseFileCard
					key={artifact.id}
					artifact={artifact}
					active={artifact.id === activeArtifactId}
					onOpen={onOpenArtifact}
					onDownload={onDownloadArtifact}
				/>
			))}
		</div>
	);
}
