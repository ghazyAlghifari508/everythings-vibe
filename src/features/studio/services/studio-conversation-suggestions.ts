import type {
	StudioFrameRow,
	StudioMessageRow,
	StudioProjectRow,
} from "@/db/schema";
import type { StudioVisibleProject } from "../types/studio-status";
import {
	getStudioScreenSuggestions,
	type StudioScreenSuggestion,
} from "./studio-screen-suggestions";

/**
 * Suggestions belong to the assistant result that produced their target, not
 * to the composer. Everything here is derived from persisted rows, so a reload
 * rebuilds the same associations without a model call or a new credit charge.
 */
export interface StudioConversationSuggestionsInput {
	project: StudioVisibleProject;
	frames: readonly StudioFrameRow[];
	messages: readonly StudioMessageRow[];
	/** A running job owns the next result; the previous list is not shown. */
	processing?: boolean;
}

function liveOperationFrameIds(
	message: StudioMessageRow,
	frames: readonly StudioFrameRow[],
): Set<string> {
	const jobIds = new Set(message.jobIds);
	const reported =
		message.progress?.frames?.map((frame) => frame.frameId) ?? [];
	// Older rows have no per-frame progress. Their own jobs still identify the
	// frames this operation wrote, never frames from a later operation.
	const fallback = frames
		.filter(
			(frame) =>
				(frame.originJobId !== null && jobIds.has(frame.originJobId)) ||
				(frame.lastJobId !== null && jobIds.has(frame.lastJobId)),
		)
		.map((frame) => frame.id);
	const ids = new Set(reported.length > 0 ? reported : fallback);
	const live = new Set(frames.map((frame) => frame.id));
	return new Set([...ids].filter((id) => live.has(id)));
}

export function deriveStudioConversationSuggestions({
	project,
	frames,
	messages,
	processing = false,
}: StudioConversationSuggestionsInput): ReadonlyMap<
	string,
	readonly StudioScreenSuggestion[]
> {
	const result = new Map<string, readonly StudioScreenSuggestion[]>();
	if (processing) return result;

	const frameNames = frames.map((frame) => frame.name);
	const frameDescriptions = frames.map((frame) => frame.description ?? "");

	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (!message || message.role !== "assistant") continue;
		if (message.status !== "completed") continue;
		let request: StudioMessageRow | undefined;
		for (let cursor = messages.length - 1; cursor >= 0; cursor--) {
			const entry = messages[cursor];
			if (entry?.role === "user" && entry.operationId === message.operationId) {
				request = entry;
				break;
			}
		}
		if (!request) continue;
		const operationIds = liveOperationFrameIds(message, frames);
		if (operationIds.size === 0) continue;
		const operationFrames = frames.filter((frame) =>
			operationIds.has(frame.id),
		);
		const operationNames = new Set(operationFrames.map((frame) => frame.name));
		// The conversation up to this answer grounds this answer's next steps.
		// Later requests cannot retroactively change an earlier result's copy.
		const history = messages
			.slice(0, index + 1)
			.filter((entry) => entry.role === "user")
			.map((entry) => entry.content);
		const suggestions = getStudioScreenSuggestions({
			projectId: project.id,
			projectTitle: project.title,
			designMode: project.designMode === "mobile" ? "mobile" : "web",
			designBlueprintVersion: project.designBlueprintVersion,
			prdContent: project.prdContent,
			prdContentHash: project.prdContentHash,
			blueprint: project.designBlueprint,
			frameNames,
			frameDescriptions,
			projectBrief: history.join("\n"),
			selectedFrameNames: [...operationNames],
			recentRequest: request.content,
		});
		// An action may only target a frame this result actually owns. Screen
		// additions stay contextual to the project, not to a stale frame.
		const scoped = suggestions.filter(
			(suggestion) =>
				!suggestion.targetFrameName ||
				operationNames.has(suggestion.targetFrameName),
		);
		if (scoped.length > 0) result.set(message.id, scoped);
	}

	return result;
}
