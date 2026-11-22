import {
	STUDIO_USER_MESSAGE_COLLAPSE_CHARS,
	STUDIO_USER_MESSAGE_COLLAPSE_LINES,
} from "@/features/studio/types/studio-constants";
import type { StudioMessageProgress } from "../types/studio-conversation";

/** Only a prompt past the threshold is collapsed; the stored content is never altered. */
export function isLongStudioUserMessage(content: string): boolean {
	return (
		content.length > STUDIO_USER_MESSAGE_COLLAPSE_CHARS ||
		content.split("\n").length > STUDIO_USER_MESSAGE_COLLAPSE_LINES
	);
}

const RUNNING_PHASE: Record<StudioMessageProgress["phase"], boolean> = {
	queued: true,
	planning: true,
	generating: true,
	completed: false,
	partial: false,
	failed: false,
};

/** Result-card label derived from persisted counts; a card exists only once frames do. */
export function describeStudioResult(
	progress: StudioMessageProgress,
): { label: string; running: boolean } | null {
	if (progress.total === 0) return null;
	const revise = progress.kind === "revise";
	return progress.phase === "completed"
		? {
				label: `${progress.ready} halaman ${revise ? "diperbarui" : "dibuat"}`,
				running: false,
			}
		: {
				label: `${progress.ready} dari ${progress.total} halaman ${revise ? "diperbarui" : "tersedia"}`,
				running: RUNNING_PHASE[progress.phase],
			};
}
