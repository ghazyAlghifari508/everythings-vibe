import { z } from "zod";
import {
	CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS,
	CODEBASE_STARTER_DESCRIPTION_MAX_CHARS,
	CODEBASE_STARTER_PROMPT_MAX_CHARS,
	CODEBASE_STARTER_TITLE_MAX_CHARS,
} from "@/lib/constants";
import { codebaseAnalysisStatusSchema } from "./sync";

// === Codebase analysis (validated advisory output) ===
// The analysis is advisory: uncertain detections must stay labeled as
// uncertainty/verification items and must never be presented as fact.

export const codebaseAnalysisFindingSchema = z.object({
	title: z.string().min(1),
	detail: z.string().min(1),
	uncertainty: z.string().min(1).optional(),
	relevantPaths: z.array(z.string().min(1)).optional(),
});

export type CodebaseAnalysisFinding = z.infer<
	typeof codebaseAnalysisFindingSchema
>;

export const CODEBASE_STARTER_IDS = [
	"feature",
	"bugfix",
	"refactor",
	"ui",
] as const;

export const codebaseStarterSuggestionSchema = z.object({
	id: z.enum(CODEBASE_STARTER_IDS),
	title: z.string().min(1).max(CODEBASE_STARTER_TITLE_MAX_CHARS),
	description: z.string().min(1).max(CODEBASE_STARTER_DESCRIPTION_MAX_CHARS),
	prompt: z.string().min(1).max(CODEBASE_STARTER_PROMPT_MAX_CHARS),
	relevantPaths: z.array(z.string().min(1)).optional(),
});

export type CodebaseStarterSuggestion = z.infer<
	typeof codebaseStarterSuggestionSchema
>;

export const codebaseStarterSuggestionsSchema = z
	.array(codebaseStarterSuggestionSchema)
	.length(CODEBASE_STARTER_IDS.length)
	.refine((suggestions) =>
		CODEBASE_STARTER_IDS.every(
			(id) =>
				suggestions.filter((suggestion) => suggestion.id === id).length === 1,
		),
	);

const codebaseAnalysisBaseSchema = z.object({
	projectId: z.string().min(1),
	snapshotId: z.string().min(1),
	// Model-generated application summary: what the app is and does, in two
	// to three Indonesian sentences. Optional so legacy rows stored before
	// this field existed keep parsing; the review UI renders an honest
	// fallback when it is absent instead of fabricating one.
	summary: z
		.string()
		.min(1)
		.max(CODEBASE_ANALYSIS_SUMMARY_MAX_CHARS)
		.optional(),
	framework: z.string().min(1).optional(),
	language: z.string().min(1).optional(),
	packageManager: z.string().min(1).optional(),
	dependencies: z.array(z.string().min(1)).optional(),
	database: z.string().min(1).nullable().optional(),
	auth: z.string().min(1).nullable().optional(),
	moduleMap: z
		.array(
			z.object({
				path: z.string().min(1),
				summary: z.string().min(1),
			}),
		)
		.optional(),
	relevantFiles: z.array(z.string().min(1)).optional(),
	impactAreas: z.array(z.string().min(1)).optional(),
	limitations: z.array(z.string().min(1)).optional(),
	findings: z.array(codebaseAnalysisFindingSchema).optional(),
});

export const codebaseAnalysisSchema = codebaseAnalysisBaseSchema.extend({
	starterSuggestions: codebaseStarterSuggestionsSchema.optional(),
});

export const codebaseAnalysisGenerationSchema =
	codebaseAnalysisBaseSchema.extend({
		starterSuggestions: codebaseStarterSuggestionsSchema,
	});

export type CodebaseAnalysis = z.infer<typeof codebaseAnalysisSchema>;

export type AnalysisValidationReason =
	| "invalid_json"
	| "schema"
	| "untrusted_paths"
	| "technical_leak";

export const ANALYSIS_VALIDATION_MESSAGE =
	"AI menghasilkan output yang tidak valid. Coba analisis ulang.";

// === Trigger/read DTOs ===

export const analysisRequestSchema = z.object({
	snapshotId: z.string().min(1).optional(),
});

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export const analysisResponseSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	snapshotId: z.string().min(1),
	status: codebaseAnalysisStatusSchema,
	output: codebaseAnalysisSchema.nullable().optional(),
	errorCode: z.string().min(1).nullable().optional(),
	errorMessage: z.string().min(1).nullable().optional(),
	createdAt: z.string().datetime().optional(),
	updatedAt: z.string().datetime().optional(),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
