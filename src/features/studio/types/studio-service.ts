import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
	StudioRevisionRow,
} from "@/db/schema";
import type { StudioDesignBlueprint } from "@/features/studio/services/studio-design-blueprint";
import type { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import type {
	StudioDesignReference,
	StudioDesignSkillId,
} from "@/features/studio/services/studio-generation-options";
import type { StudioJobClaim } from "../services/studio-job-lease";
import type { StudioDesignMode } from "./studio-prompts";

export interface InitialFrameContext {
	frame: StudioFrameRow;
	jobPrompt: string;
	allScreenNames: string[];
	designSkillId: StudioDesignSkillId;
	designMd: string | null;
	logoUrl: string | null;
	dsTokens: ReturnType<typeof extractDesignSystemTokens>;
	blueprint: StudioDesignBlueprint | null;
	prdContent?: string | null;
	lease: StudioJobClaim;
	signal: AbortSignal;
}

export interface ValidatedFrameInput {
	framePrompt: string;
	stage?: "frame" | "revision";
	activeScreen?: string;
	blueprint: StudioDesignBlueprint | null;
	viewport: StudioDesignMode;
	expectTokens: boolean;
	designSkillId: StudioDesignSkillId;
	dsTokens: ReturnType<typeof extractDesignSystemTokens>;
	logoUrl: string | null;
	signal?: AbortSignal;
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
	designSkillId?: StudioDesignSkillId;
	initialPageCount?: number;
	designReference?: StudioDesignReference | null;
	prdAttachment?: { filename: string; content: string } | null;
}

export interface StudioPreferencesInput {
	designSkillId: StudioDesignSkillId;
}
