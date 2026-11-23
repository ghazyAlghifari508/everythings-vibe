import type { StudioDesignBlueprint } from "@/features/studio/services/studio-design-blueprint";
import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";

/**
 * Contract for Studio's internal EvVibe design intelligence.
 *
 * Consumed by VibeDesign's own engine at runtime, never by a coding agent, and
 * never selectable by a user: no picker, no version column, no per-project
 * choice. Every planning, frame, add-screen, revision and repair request gets
 * the stage context it needs and nothing more.
 *
 * Knowledge lives in TypeScript string modules because the production worker
 * runs under `node --import tsx`, where Vite `?raw` imports do not resolve.
 */
export const EVVIBE_DESIGN_INTERNAL_ID = "evvibe-design";

/**
 * Delivery stages.
 * - `planning` is platform-neutral and lives in the cached system prefix.
 * - `planning-platform` is the platform addendum of the planning user prompt.
 * - `generation` is the static frame standard in the system prompt.
 * - `initial`, `add-screen` and `revision` are per-request addenda.
 * - `prototype` is the interaction contract between generated markup and the
 *   trusted prototype runtime; every frame request carries it.
 * - `correction` intentionally delivers nothing: the frame system prompt and
 *   the reported defects already cover a bounded repair, and adding general
 *   guidance there only pushes a large document over the correction budget.
 */
export type EvvibeDesignStage =
	| "planning"
	| "planning-platform"
	| "generation"
	| "initial"
	| "add-screen"
	| "revision"
	| "prototype"
	| "correction";

export type EvvibeDesignLayoutIntent =
	StudioDesignBlueprint["productIdentity"]["layoutIntent"];

export type EvvibeDesignComposition = NonNullable<
	StudioDesignBlueprint["screenPlan"][number]["composition"]
>;

export interface EvvibeDesignReference {
	/** Stable id, reported in the context plan and used by tests. */
	id: string;
	title: string;
	/** Restricts a reference whose guidance only holds on one platform. */
	viewport?: StudioDesignMode;
	/** Restricts a reference to the page families it actually describes. */
	intents?: readonly EvvibeDesignLayoutIntent[];
	/** Whole-entry markdown; entries are never cut mid-rule. */
	body: string;
}

export interface EvvibeDesignContextOptions {
	viewport?: StudioDesignMode;
	layoutIntent?: EvvibeDesignLayoutIntent;
	composition?: EvvibeDesignComposition;
}

export interface EvvibeDesignContextPlan {
	stage: EvvibeDesignStage;
	text: string;
	includedIds: string[];
	/** Entries that did not fit the stage budget, in declaration order. */
	omittedIds: string[];
	chars: number;
	budgetChars: number;
}

/**
 * Hard character ceilings, not goals. P1.1 re-derived them after consolidating
 * duplicated guidance: the frame prompt is sent once per screen plus once per
 * repair round, so the intelligence has to stay small next to the PRD,
 * blueprint and DESIGN.md that share the context window.
 */
export const EVVIBE_DESIGN_STAGE_BUDGET_CHARS: Record<
	EvvibeDesignStage,
	number
> = {
	planning: 14_000,
	"planning-platform": 4_000,
	generation: 9_000,
	initial: 5_000,
	"add-screen": 5_000,
	revision: 4_000,
	prototype: 3_600,
	correction: 0,
};

/**
 * Conflict order. The intelligence refines the universal quality standard and
 * the shared blueprint; it sits below user requirements, PRD facts and
 * DESIGN.md tokens, so it can never silently override a user-directed identity.
 */
export const EVVIBE_DESIGN_PRECEDENCE =
	"security and HTML safety > explicit user requirements > valid PRD / product constraints > selected DESIGN.md or theme reference > existing shared project blueprint > EvVibe design intelligence > default product guidance";

/** Stated once ahead of every stage, so no stage reads as a component checklist. */
export const EVVIBE_DESIGN_REASONING_LAW =
	"Before any component decision, name the product, its user, that user's goal on this screen and the data or action the screen must carry. Justify every block by what it lets the user do or understand, and justify its absence when a familiar component (navbar, card, badge, sidebar, table, carousel, modal, CTA) would add nothing. Content decides composition; habit does not.";
