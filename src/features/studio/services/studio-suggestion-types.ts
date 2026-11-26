import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

/** Intent categories the current engine can execute safely. */
export type StudioSuggestionIntent =
	| "add_screen"
	| "add_state"
	| "improve_screen"
	| "complete_flow"
	| "add_validation"
	| "refine_domain";

export type StudioActionKind = Exclude<StudioSuggestionIntent, "add_screen">;

/** One contextual action card above the composer. */
export interface StudioScreenSuggestion {
	id: string;
	/** Canonical action name; the full prompt still carries the real instruction. */
	title: string;
	/** Sentence-length copy shown on the card. */
	cardCopy: string;
	/** One short line: what the user gets from this change. */
	description: string;
	/** Complete, editable instruction filled into the composer on click. */
	prompt: string;
	intent: StudioSuggestionIntent;
	/** Internal grounding, never shown as decorative copy. */
	reason: string;
	/** Exact existing frame this action targets; absent for a new screen. */
	targetFrameName?: string;
}

export interface StudioSuggestionInput {
	projectId: string;
	projectTitle: string;
	designMode: StudioDesignMode;
	/** Bumped whenever the shared blueprint is rewritten. */
	designBlueprintVersion: number;
	prdContent: string | null;
	prdContentHash: string | null;
	blueprint: StudioDesignBlueprint | null;
	frameNames: readonly string[];
	/** Frame descriptions hold the prompt that asked for each screen. */
	frameDescriptions?: readonly string[];
	/** The project's message history: original brief and later requests. */
	projectBrief?: string;
	/** Frames currently selected on the canvas. */
	selectedFrameNames?: readonly string[];
	/** Most recent conversation turn, used to ground the next action. */
	recentRequest?: string;
}

/** Two or three cards stay readable; a longer list is a wall of filler. */
export const STUDIO_SCREEN_SUGGESTION_LIMIT = 3;
