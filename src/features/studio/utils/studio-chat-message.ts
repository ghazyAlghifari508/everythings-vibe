import type { StudioFrameRow, StudioMessageRow } from "@/db/schema";
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

export function isStudioProgressRunning(
	progress: Pick<StudioMessageProgress, "phase">,
): boolean {
	return RUNNING_PHASE[progress.phase];
}

/**
 * The one short operational line under an assistant turn. It is derived from
 * the persisted job counts only and never carries an explanation, so the
 * authored message above it is not a status log.
 */
export function describeStudioStatus(
	message: Pick<StudioMessageRow, "status" | "progress">,
): { label: string; running: boolean } {
	const progress = message.progress;
	const revise = progress?.kind === "revise";
	if (!progress) {
		const running =
			message.status === "queued" ||
			message.status === "planning" ||
			message.status === "generating";
		return {
			label: running
				? "Menunggu giliran"
				: message.status === "failed"
					? "Belum berhasil"
					: "Selesai",
			running,
		};
	}
	const running = isStudioProgressRunning(progress);
	switch (progress.phase) {
		case "queued":
			return { label: "Menunggu giliran", running };
		case "planning":
			return { label: "Menyusun daftar layar", running };
		case "generating":
			return {
				label: progress.total
					? `${revise ? "Menerapkan revisi" : "Membuat layar"} ${progress.ready} dari ${progress.total}`
					: "Menyiapkan desain",
				running,
			};
		case "completed":
			return { label: "Selesai", running };
		case "partial": {
			const open = Math.max(progress.failed, progress.total - progress.ready);
			return { label: `${open} layar perlu dicoba ulang`, running };
		}
		case "failed":
			return { label: "Belum berhasil", running };
	}
}

export interface StudioResultRow {
	key: string;
	/** Frame on this canvas this row opens; null when it no longer exists. */
	frameId: string | null;
	name: string;
	platform: "web" | "mobile";
	status: "ready" | "failed" | "pending";
	/** True once the canvas frame moved past the revision this turn reported. */
	changedSince: boolean;
}

export interface StudioResultCard {
	title: string;
	rows: StudioResultRow[];
}

/**
 * Rows of the result card. New turns carry the exact frames they produced;
 * older turns only stored names, which resolve to the current canvas frames.
 * Ids are always checked against this project's own frames, so a row can never
 * point at a frame from another project.
 */
export function describeStudioResult(
	progress: StudioMessageProgress,
	frames: readonly StudioFrameRow[],
): StudioResultCard | null {
	const byId = new Map(frames.map((frame) => [frame.id, frame]));
	const rows: StudioResultRow[] = progress.frames
		? progress.frames.map((entry) => {
				const frame = byId.get(entry.frameId);
				return {
					key: entry.frameId,
					frameId: frame ? frame.id : null,
					name: frame?.name || entry.name,
					platform: entry.viewport,
					status: entry.status,
					changedSince: Boolean(
						frame &&
							entry.status === "ready" &&
							frame.revision > entry.revision,
					),
				};
			})
		: progress.screenNames.map((name, index) => {
				const frame = frames.find((entry) => entry.name === name);
				const failed = progress.failedScreens?.includes(name) ?? false;
				return {
					key: `${index}:${name}`,
					frameId: frame?.id ?? null,
					name,
					platform: frame?.viewport === "mobile" ? "mobile" : "web",
					// Name-only rows: a screen is pending only while its job still runs;
					// afterwards every screen not recorded as failed was completed.
					status: failed
						? "failed"
						: frame
							? frame.htmlCode && frame.status === "ready"
								? "ready"
								: "pending"
							: isStudioProgressRunning(progress)
								? "pending"
								: "ready",
					changedSince: false,
				};
			});
	if (!rows.length) return null;
	const ready = rows.filter((row) => row.status === "ready").length;
	const verb = progress.kind === "revise" ? "diperbarui" : "dibuat";
	const title =
		ready === rows.length
			? `${ready} layar ${verb}`
			: ready === 0 && isStudioProgressRunning(progress)
				? `${rows.length} layar ${progress.kind === "revise" ? "diperbarui" : "dibuat"}…`
				: `${ready} dari ${rows.length} layar ${verb}`;
	return { title, rows };
}

/** Thumbnail box in CSS px. The document is rendered at its real width and scaled to fit. */
export const STUDIO_THUMBNAIL_BOX = {
	web: { width: 96, height: 64, documentWidth: 1440 },
	mobile: { width: 32, height: 64, documentWidth: 390 },
} as const;

export function studioThumbnailGeometry(platform: "web" | "mobile") {
	const box = STUDIO_THUMBNAIL_BOX[platform];
	const scale = box.width / box.documentWidth;
	return {
		boxWidth: box.width,
		boxHeight: box.height,
		documentWidth: box.documentWidth,
		documentHeight: Math.round(box.height / scale),
		scale,
	};
}
