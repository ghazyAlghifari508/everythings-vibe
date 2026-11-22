import type { StudioDesignBlueprint } from "@/features/studio/services/studio-design-blueprint";
import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";

/**
 * Contract for Studio's internal EvVibe design intelligence.
 *
 * This package is consumed by VibeDesign's own engine at runtime, not by a
 * coding agent. It is not user-selectable: there is no skill picker, no
 * version column and no per-project choice. Every planning, frame, add-screen,
 * revision and correction request receives the stage context it needs and
 * nothing else.
 *
 * The modules are TypeScript on purpose. Studio's worker runs under
 * `node --import tsx`, where Vite `?raw` imports do not resolve, so encoding
 * the knowledge as compiled string constants is what makes it load in both the
 * dev server and the production worker.
 */
export const EVVIBE_DESIGN_INTERNAL_ID = "evvibe-design";

/**
 * Delivery stages. `generation` is the static frame standard that is composed
 * into the frame system prompt; `initial`, `add-screen`, `revision` and
 * `correction` are per-request addenda.
 */
export type EvvibeDesignStage =
	| "planning"
	| "generation"
	| "initial"
	| "add-screen"
	| "revision"
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
 * Hard character ceilings per stage, not goals. The frame prompt is sent once
 * per screen plus once per repair round, so the intelligence has to stay far
 * below the output-token cap and leave room for the PRD, blueprint and
 * DESIGN.md that share the context window.
 */
export const EVVIBE_DESIGN_STAGE_BUDGET_CHARS: Record<
	EvvibeDesignStage,
	number
> = {
	// One planning request per project, so this carries the product-reasoning,
	// website, mobile, navigation, imagery and accessibility guidance together.
	planning: 20_000,
	generation: 17_000,
	initial: 9_000,
	"add-screen": 9_000,
	revision: 8_800,
	// A repair round already receives the exact failing issues; only the
	// layout-fix rules travel with them.
	correction: 4_400,
};

/**
 * Where the internal intelligence sits in the conflict order. It refines the
 * universal quality standard and the shared blueprint; it sits below user
 * requirements, PRD facts and DESIGN.md tokens, so it can never silently
 * override a user-directed identity.
 */
export const EVVIBE_DESIGN_PRECEDENCE =
	"security and HTML safety > explicit user requirements > valid PRD / product constraints > selected DESIGN.md or theme reference > existing shared project blueprint > EvVibe design intelligence > default product guidance";

/**
 * The reasoning law stated once, ahead of every stage's rules, so no stage can
 * be read as a component checklist to apply regardless of the product.
 */
export const EVVIBE_DESIGN_REASONING_LAW =
	"Before any component decision, name the product, its user, that user's goal on this screen and the data or action the screen must carry. Justify every block by what it lets the user do or understand, and justify its absence when a familiar component (navbar, card, badge, sidebar, table, carousel, modal, CTA) would add nothing. Content decides composition; habit does not. A component earns its place or it is not rendered.";
