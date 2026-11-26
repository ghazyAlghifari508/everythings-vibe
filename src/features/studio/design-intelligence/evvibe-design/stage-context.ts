import { EVVIBE_DESIGN_EXAMPLES } from "./examples";
import { EVVIBE_DESIGN_REFERENCES } from "./references";
import {
	EVVIBE_DESIGN_INTERNAL_ID,
	EVVIBE_DESIGN_PRECEDENCE,
	EVVIBE_DESIGN_REASONING_LAW,
	EVVIBE_DESIGN_STAGE_BUDGET_CHARS,
	type EvvibeDesignContextOptions,
	type EvvibeDesignContextPlan,
	type EvvibeDesignReference,
	type EvvibeDesignStage,
} from "./skill-contract";

const ALL_REFERENCES: readonly EvvibeDesignReference[] = [
	...EVVIBE_DESIGN_REFERENCES,
	...EVVIBE_DESIGN_EXAMPLES,
];

const REFERENCE_BY_ID = new Map(
	ALL_REFERENCES.map((reference) => [reference.id, reference]),
);

/**
 * Delivery order per stage, highest priority first. A stage lists only what it
 * genuinely adds: `revision` does not repeat the generation standard that the
 * frame system prompt already carries, and `correction` repeats nothing at all.
 */
export const EVVIBE_DESIGN_STAGE_REFERENCES: Record<
	EvvibeDesignStage,
	readonly string[]
> = {
	planning: [
		"design-reasoning",
		"navigation-patterns",
		"media-and-imagery",
		"anti-slop",
		"accessibility",
	],
	"planning-platform": ["web-design", "mobile-design"],
	generation: [
		"typography-and-layout",
		"component-library",
		"media-and-imagery",
		"anti-slop",
	],
	initial: [
		"web-design",
		"mobile-design",
		"website-patterns",
		"mobile-patterns",
		"good-vs-bad",
	],
	"add-screen": ["navigation-patterns", "web-design", "mobile-design"],
	revision: ["revision-scope", "good-vs-bad"],
	prototype: ["prototype-interactions"],
	correction: [],
};

function applicable(
	reference: EvvibeDesignReference,
	options: EvvibeDesignContextOptions,
): boolean {
	if (reference.viewport && reference.viewport !== options.viewport)
		return false;
	if (reference.intents)
		return Boolean(
			options.layoutIntent && reference.intents.includes(options.layoutIntent),
		);
	return true;
}

function contextHeader(stage: EvvibeDesignStage): string {
	return `<EVVIBE_DESIGN_INTELLIGENCE id="${EVVIBE_DESIGN_INTERNAL_ID}" stage="${stage}" scope="internal">
Studio's own design intelligence for this stage. It refines the universal quality standard above; it never replaces it and never overrides the user's requirements, the PRD facts or the DESIGN.md tokens.
Reasoning law: ${EVVIBE_DESIGN_REASONING_LAW}
Precedence: ${EVVIBE_DESIGN_PRECEDENCE}.`;
}

/**
 * Selects whole stage sections under a hard character budget. A section that
 * does not fit is dropped whole and reported; text is never cut mid-rule.
 */
export function planEvvibeDesignContext(
	stage: EvvibeDesignStage,
	options: EvvibeDesignContextOptions = {},
): EvvibeDesignContextPlan {
	const budgetChars = EVVIBE_DESIGN_STAGE_BUDGET_CHARS[stage];
	const header = contextHeader(stage);
	const included: EvvibeDesignReference[] = [];
	const omittedIds: string[] = [];
	let chars = header.length;

	for (const id of EVVIBE_DESIGN_STAGE_REFERENCES[stage]) {
		const reference = REFERENCE_BY_ID.get(id);
		if (!reference) throw new Error(`Unknown EvVibe design reference: ${id}`);
		if (!applicable(reference, options)) continue;
		const section = `\n\n## ${reference.title}\n${reference.body}`;
		if (
			chars + section.length >
			budgetChars - "\n</EVVIBE_DESIGN_INTELLIGENCE>".length
		) {
			omittedIds.push(id);
			continue;
		}
		included.push(reference);
		chars += section.length;
	}

	if (included.length === 0)
		return {
			stage,
			text: "",
			includedIds: [],
			omittedIds,
			chars: 0,
			budgetChars,
		};

	const text = `${header}${included
		.map((reference) => `\n\n## ${reference.title}\n${reference.body}`)
		.join("")}\n</EVVIBE_DESIGN_INTELLIGENCE>`;
	return {
		stage,
		text,
		includedIds: included.map((reference) => reference.id),
		omittedIds,
		chars: text.length,
		budgetChars,
	};
}

export function buildEvvibeDesignContext(
	stage: EvvibeDesignStage,
	options: EvvibeDesignContextOptions = {},
): string {
	return planEvvibeDesignContext(stage, options).text;
}
