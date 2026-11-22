import type {
	StudioFrameRow,
	StudioJobRow,
	StudioMessageRow,
	StudioProjectRow,
	StudioRevisionRow,
} from "@/db/schema";
import type { StudioDesignBlueprint } from "@/features/studio/services/studio-design-blueprint";
import type { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import type { StudioDesignReference } from "@/features/studio/services/studio-generation-options";
import type { StudioJobClaim } from "../services/studio-job-lease";
import type { StudioDesignMode } from "./studio-prompts";

export interface InitialFrameContext {
	frame: StudioFrameRow;
	jobPrompt: string;
	allScreenNames: string[];
	designMd: string | null;
	logoUrl: string | null;
	dsTokens: ReturnType<typeof extractDesignSystemTokens>;
	blueprint: StudioDesignBlueprint | null;
	prdContent?: string | null;
	lease: StudioJobClaim;
	signal: AbortSignal;
}

/**
 * Whether a frame already owns a committed design. A correction may never
 * regenerate a preserved design from the blueprint just because its candidate
 * did not fit the repair budget.
 */
export type StudioFramePreservationPolicy = "new-frame" | "preserve-existing";

export interface ValidatedFrameInput {
	framePrompt: string;
	activeScreen?: string;
	blueprint: StudioDesignBlueprint | null;
	viewport: StudioDesignMode;
	expectTokens: boolean;
	dsTokens: ReturnType<typeof extractDesignSystemTokens>;
	logoUrl: string | null;
	signal?: AbortSignal;
	previousHtml?: string | null;
	contentContext?: { brief: string; prdContent?: string | null };
	/** Required: the operation must state whether it may discard a design. */
	preservation: StudioFramePreservationPolicy;
	/** The user's actual modification, kept scoped through correction. */
	requestedChange?: string;
	timing?: { jobId: string; projectId: string; frameId: string };
}

export interface StudioProjectDetail extends StudioProjectRow {
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
	logoUrl: string | null;
}

export interface StudioProjectFullDetail {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
	jobs: StudioJobRow[];
	messages: StudioMessageRow[];
	logoUrl: string | null;
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
}

export interface StudioLogoInput {
	filename: string;
	mimeType: string;
	data: string; // base64 encoded
}

export interface CreateStudioProjectInput {
	title?: string;
	prompt: string;
	designMode?: StudioDesignMode;
	designMd?: string | null;
	logo?: StudioLogoInput | null;
	designReference?: StudioDesignReference | null;
	prdAttachment?: { filename: string; content: string } | null;
}
