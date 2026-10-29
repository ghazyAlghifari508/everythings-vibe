import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
	StudioRevisionRow,
} from "@/db/schema";

/**
 * A logo the operator attached as part of a design reference. `data` is base64
 * without the data-URL prefix; `previewUrl` keeps the full data URL so the
 * picker can show it without re-encoding.
 */
export interface AttachedLogo {
	filename: string;
	mimeType: string;
	data: string; // base64
	previewUrl?: string;
	byteLength?: number;
}

/** One row of the Studio project history sidebar. */
export interface StudioHistoryItem {
	id: string;
	title: string;
	designMode?: string;
	hasDesignMd?: boolean;
	hasLogo?: boolean;
	createdAt: string;
}

/**
 * What a retry request actually did: `queued` started a new run,
 * `already-running` was a duplicate request while a run is in flight, and
 * `completed` means the frame still renders and was left untouched.
 */
export type StudioFrameRetryOutcome =
	| "queued"
	| "already-running"
	| "completed";

/** Everything the Studio canvas route needs to render a project workspace. */
export interface StudioDetailLoaderData {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
	logoUrl: string | null;
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
}
