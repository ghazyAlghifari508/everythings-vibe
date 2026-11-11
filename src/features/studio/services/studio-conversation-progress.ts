import type {
	StudioFrameRow,
	StudioJobRow,
	StudioMessageRow,
} from "@/db/schema";
import type { StudioMessageProgress } from "../types/studio-conversation";

const active = ["queued", "planning", "generating"];

/** A revision is successful only after its own job persisted a newer frame version. */
export function resolveStudioMessageProgress(
	message: StudioMessageRow,
	jobs: StudioJobRow[],
	frames: StudioFrameRow[],
): StudioMessageProgress {
	const related = jobs.filter((job) => message.jobIds.includes(job.id));
	const initial = related.find((job) => job.jobType === "initial");
	const planned = Boolean(initial?.planningCompletedAt);
	const targets = initial
		? frames.filter((frame) => frame.originJobId === initial.id)
		: frames.filter((frame) =>
				related.some((job) => job.targetFrameId === frame.id),
			);
	const total = initial ? targets.length : related.length;
	const ready = initial
		? targets.filter((frame) => frame.htmlCode && frame.revision > 0).length
		: related.filter(
				(job) =>
					job.status === "completed" &&
					targets.some(
						(frame) =>
							frame.id === job.targetFrameId &&
							frame.htmlCode &&
							frame.revision > (job.baseRevision ?? 0),
					),
			).length;
	const failed = initial
		? targets.filter((frame) => !frame.htmlCode && frame.status === "failed")
				.length
		: related.filter((job) => job.status === "failed").length;
	const recovering = initial
		? jobs.filter(
				(job) =>
					job.jobType === "retry" &&
					targets.some(
						(frame) => frame.id === job.targetFrameId && !frame.htmlCode,
					),
			)
		: [];
	const live = [...related, ...recovering];
	const running = live.some((job) => active.includes(job.status));
	const phase = live.some((job) => job.status === "planning")
		? "planning"
		: running
			? live.some((job) => job.status === "generating")
				? "generating"
				: "queued"
			: total > 0 && ready === total
				? "completed"
				: ready > 0
					? "partial"
					: "failed";
	return {
		phase,
		ready,
		total,
		failed,
		screenNames:
			initial && !planned
				? []
				: initial && message.progress?.screenNames.length
					? message.progress.screenNames
					: targets.map((frame) => frame.name),
		recovery:
			running || phase === "completed"
				? null
				: initial && !planned
					? "planning"
					: initial || related.some((job) => job.jobType === "add")
						? "frames"
						: "resubmit",
	};
}

export function describeStudioMessageProgress(
	progress: StudioMessageProgress,
): string {
	const { phase, ready, total, failed, screenNames } = progress;
	const plan = screenNames.length
		? `Rencana layar: ${screenNames.join(", ")}.\n`
		: "";
	if (phase === "queued")
		return `${plan}Permintaan diterima dan menunggu giliran. Pekerjaan yang sedang berjalan tetap dilanjutkan.`;
	if (phase === "planning") return "Sedang menyusun rencana layar.";
	if (phase === "generating")
		return `${plan}${ready} dari ${total} halaman tersedia.`;
	if (phase === "completed") return `${plan}${ready} halaman selesai diproses.`;
	if (phase === "partial")
		return `${plan}${ready} halaman tersedia. ${Math.max(failed, total - ready)} halaman belum berhasil diproses.`;
	return progress.recovery === "planning"
		? "Rencana layar belum berhasil disusun. Pulihkan perencanaan di canvas."
		: `${plan}Permintaan belum berhasil diproses. ${progress.recovery === "frames" ? "Pulihkan halaman yang gagal di canvas." : "Pilih layar terbaru lalu kirim ulang instruksi."}`;
}
