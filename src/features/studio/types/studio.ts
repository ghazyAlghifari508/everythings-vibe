import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
	StudioRevisionRow,
} from "@/db/schema";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";
import type { StudioDesignReference } from "@/features/studio/services/studio-generation-options";

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

/** A DESIGN.md plus its optional logo, staged but not yet applied. */
export interface AttachedDesignReference {
	designMd: string;
	logo: AttachedLogo | null;
	// Set when the DESIGN.md must be resolved server-side (a stored VibeScrape
	// document) instead of being sent as text from the browser.
	designReference?: StudioDesignReference | null;
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

/** Everything the Studio canvas route needs to render a project workspace. */
export interface StudioDetailLoaderData {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
	logoUrl: string | null;
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
	scrapeSources: ScrapeDesignSource[];
}
