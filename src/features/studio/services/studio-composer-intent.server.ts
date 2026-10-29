import { z } from "zod";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { extractJson } from "@/lib/services/json-extract";
import {
	resolveStudioIntentFromContext,
	STUDIO_CLARIFY_MESSAGE,
	STUDIO_INTENT_MAX_TOKENS,
	type StudioIntentDecision,
} from "./studio-composer-intent";
import { STUDIO_MAX_PAGE_COUNT } from "./studio-generation-options";

// Bounded classification: the model only has to pick one of three labels and
// may name requested screens. Everything else is validated here, so a
// malformed or over-eager response degrades to a clarifying question.
const aiIntentSchema = z.object({
	intent: z.enum(["add_screen", "revise_project", "clarify"]),
	screens: z
		.array(z.string().trim().min(1).max(60))
		.max(STUDIO_MAX_PAGE_COUNT)
		.optional(),
});

const SYSTEM_PROMPT = [
	"You classify one design-studio chat message into a bounded intent. Answer with strict JSON only.",
	"intents:",
	'- "add_screen": the user asks to create one or more new screens or pages.',
	'- "revise_project": the user explicitly asks to change every screen or the whole project.',
	'- "clarify": the message has no clear screen target.',
	'Schema: {"intent":"add_screen"|"revise_project"|"clarify","screens":["..."]}',
	'"screens" is only meaningful for add_screen and holds the requested screen names.',
	"Never treat the absence of a selected screen as a request to change every screen.",
].join("\n");

export interface StudioIntentContext {
	prompt: string;
	selectedFrameIds: string[];
	existingScreenNames: string[];
	projectTitle: string;
	signal?: AbortSignal;
}

function clarify(): StudioIntentDecision {
	return { intent: "clarify", screens: [], message: STUDIO_CLARIFY_MESSAGE };
}

/** Deterministic resolution first, bounded model classification for the rest. */
export async function resolveStudioOperationIntent(
	input: StudioIntentContext,
): Promise<StudioIntentDecision> {
	const deterministic = resolveStudioIntentFromContext({
		prompt: input.prompt,
		selectedFrameIds: input.selectedFrameIds,
	});
	if (deterministic) return deterministic;
	return (await classifyStudioIntentWithAi(input)) ?? clarify();
}

async function classifyStudioIntentWithAi(
	input: StudioIntentContext,
): Promise<StudioIntentDecision | null> {
	try {
		const { generator, firstChunk } = await tryStreamWithFallback(
			selectModels(),
			[
				{ role: "system", content: SYSTEM_PROMPT },
				{
					role: "user",
					content: JSON.stringify({
						project: input.projectTitle,
						screens: input.existingScreenNames,
						message: input.prompt,
					}),
				},
			],
			input.signal,
			STUDIO_INTENT_MAX_TOKENS,
		);
		let raw = firstChunk;
		for await (const chunk of generator) raw += chunk;
		if (input.signal?.aborted) return null;
		const parsed = aiIntentSchema.safeParse(JSON.parse(extractJson(raw)));
		if (!parsed.success) return null;
		if (parsed.data.intent === "clarify") return clarify();
		if (parsed.data.intent === "add_screen") {
			const screens = [
				...new Set(
					(parsed.data.screens ?? [])
						.map((name) => name.trim())
						.filter((name) => name.length > 0),
				),
			];
			return { intent: "add_screen", screens, message: null };
		}
		// A project-wide rewrite is destructive, so a model guess is not enough:
		// the message itself must carry an explicit scope word.
		return /semua|seluruh|setiap|tiap|project|aplikasi/i.test(input.prompt)
			? { intent: "revise_project", screens: [], message: null }
			: clarify();
	} catch {
		return null;
	}
}
