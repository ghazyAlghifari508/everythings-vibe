// The three user-facing sync rows, built from persisted facts only.
//
// Split out of `sync-stages.ts` so the stage-to-product mapping and the row copy
// stay separately readable. Every timestamp, count, and state below comes from a
// real server record: nothing here advances on a timer.
import type {
	SyncStageProgress,
	SyncStageRow,
} from "@/features/codebase/services/sync-stages";

const AGENT_TITLE = "Menunggu agent terhubung";
const AGENT_HINT = "Jalankan prompt dari root repository.";
const PREPARE_TITLE = "Menyiapkan source code";
const SYNC_TITLE = "Mengunggah repository";

export function buildAgentRow(
	progress: SyncStageProgress,
	agentConnectedAt: string | null,
): SyncStageRow {
	if (progress === "waiting") {
		// The wait is the real, current state of this attempt: the session exists and
		// nothing has contacted the server yet. It is therefore an active indicator,
		// not an empty circle — the user must see the stage that is happening now.
		return {
			state: "active",
			title: `${AGENT_TITLE}...`,
			detail: AGENT_HINT,
		};
	}
	return {
		state: "done",
		title: "Agent terhubung",
		detail: "Agent berhasil tersambung ke everythings-vibe.",
		...(agentConnectedAt ? { completedAt: agentConnectedAt } : {}),
	};
}

export function buildPreparingRow(
	progress: SyncStageProgress,
	preparationStartedAt: string | null,
): SyncStageRow {
	if (progress === "preparing") {
		return {
			state: "active",
			title: `${PREPARE_TITLE}...`,
			detail: "Memeriksa file project yang akan disinkronkan.",
			// The handshake is when preparation really began: the CLI handshakes
			// BEFORE it walks the repository, so this elapsed window is measured
			// from a persisted fact.
			...(preparationStartedAt ? { startedAt: preparationStartedAt } : {}),
		};
	}
	if (progress === "syncing" || progress === "done") {
		return {
			state: "done",
			title: "Source code siap",
			detail: "File project yang relevan sudah disiapkan.",
		};
	}
	return { state: "waiting", title: PREPARE_TITLE };
}

export function buildSyncingRow(
	progress: SyncStageProgress,
	fileCount: number | undefined,
	uploadStartedAt: string | null,
	snapshotPersistedAt: string | null,
	snapshotPersistedCount: number | undefined,
	uploadProgress: { manifestCount?: number; uploadedCount?: number },
): SyncStageRow {
	if (progress === "done") {
		const verifiedCount =
			typeof snapshotPersistedCount === "number"
				? snapshotPersistedCount
				: fileCount;
		return {
			state: "done",
			title: "Sinkronisasi selesai",
			detail:
				typeof verifiedCount === "number"
					? `${verifiedCount} file berhasil diterima.`
					: "Source code berhasil diterima.",
			...(snapshotPersistedAt ? { completedAt: snapshotPersistedAt } : {}),
		};
	}
	if (progress === "syncing") {
		const row: SyncStageRow = {
			state: "active",
			title: `${SYNC_TITLE}...`,
			detail: "Mengirim source code ke everythings-vibe.",
			// Upload start is the persisted moment transport actually began, so
			// the elapsed timer measures real transfer time.
			...(uploadStartedAt ? { startedAt: uploadStartedAt } : {}),
		};
		// Determinate progress only from persisted rows: files whose every chunk has
		// landed, against the entries the CLI announced. A half-uploaded file is
		// never counted, and no percentage is derived from a timer.
		const uploaded = uploadProgress.uploadedCount;
		const announced = uploadProgress.manifestCount;
		if (
			typeof uploaded === "number" &&
			typeof announced === "number" &&
			announced > 0
		) {
			row.meta = `${uploaded} dari ${announced} file`;
		} else if (typeof fileCount === "number" && fileCount > 0) {
			row.meta = `${fileCount} file sedang dikirim.`;
		}
		return row;
	}
	return { state: "waiting", title: SYNC_TITLE };
}
