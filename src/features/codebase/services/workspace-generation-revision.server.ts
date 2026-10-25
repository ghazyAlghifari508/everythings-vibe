import { createHash } from "node:crypto";
import type { CodebaseRunStage } from "./chat-flow-run";

interface WorkspaceGenerationSource {
	snapshotId: string;
	analysisId?: string;
	language: string | null;
	handoff: unknown;
	featureTree: unknown;
	prdVersionId: string | null;
	acVersionId: string | null;
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.filter(([, item]) => item !== undefined)
			.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value ?? null);
}

export function workspaceGenerationRevision(
	stage: CodebaseRunStage,
	source: WorkspaceGenerationSource,
): string {
	return createHash("sha256")
		.update(
			canonical({
				stage,
				snapshotId: source.snapshotId,
				analysisId: source.analysisId,
				language: source.language,
				...(stage !== "questions" ? { handoff: source.handoff } : {}),
				...(["prd", "ac", "task"].includes(stage)
					? { featureTree: source.featureTree }
					: {}),
				...(["ac", "task"].includes(stage)
					? { prdVersionId: source.prdVersionId }
					: {}),
				...(stage === "task" ? { acVersionId: source.acVersionId } : {}),
			}),
		)
		.digest("hex");
}
