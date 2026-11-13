"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ArtifactKind } from "@/features/codebase/services/workspace-hydration";

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
				<Icon icon={Alert02Icon} size={12} aria-hidden="true" />
				Sebagian planning tidak dapat dimuat:{" "}
				{failedArtifacts.map(artifactLabel).join(", ")}. Bagian lain tetap
				tersimpan di server.
			</span>
		</div>
	);
}
