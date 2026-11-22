import { z } from "zod";
import type { StudioDesignBlueprint } from "@/features/studio/services/studio-design-blueprint";

export type StudioDesignMode = "web" | "mobile";

export const studioScreenPlanItemSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).default(""),
	viewport: z.enum(["web", "mobile"]),
	order: z.number().int().nonnegative(),
});

export const studioInitialScopeSchema = z.object({
	requestedCount: z.int().positive().nullable(),
	rationale: z.string().trim().min(1).max(500),
	deferred: z.array(z.string().trim().min(1).max(160)).max(12),
});

export const studioScreenPlanSchema = z.object({
	projectTitle: z.string().min(1).max(200),
	scope: studioInitialScopeSchema.optional(),
	screens: z.array(studioScreenPlanItemSchema).min(1).max(8),
});

export type StudioScreenPlanItem = z.infer<typeof studioScreenPlanItemSchema>;
export type StudioScreenPlan = z.infer<typeof studioScreenPlanSchema>;

export interface StudioFramePromptOptions {
	screenName: string;
	screenDescription?: string;
	allScreens?: string[];
	projectPrompt: string;
	designMode: StudioDesignMode;
	designMd?: string | null;
	logoUrl?: string | null;
	previousHtml?: string;
	blueprint?: StudioDesignBlueprint | null;
	activeScreen?: string;
	prdContent?: string | null;
	/** Distinguishes a first-time screen from one added to an existing project. */
	screenOrigin?: "initial" | "add";
}

export type StudioPromptValidation =
	| { ok: true; prompt: string }
	| { ok: false; error: string };

export interface StudioPromptOptions {
	previousHtml?: string;
	designMode?: StudioDesignMode;
	designMd?: string | null;
	logoUrl?: string | null;
	prdContent?: string | null;
}
