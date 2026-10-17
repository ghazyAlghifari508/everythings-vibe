import { z } from "zod";
import { designSettingsSchema, SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";

export const DESIGN_EVIDENCE_LIMITS = {
	elements: 250,
	scanElements: 5000,
	fonts: 50,
	variables: 100,
	valueChars: 2000,
	selectorChars: 4000,
} as const;

export const DESIGN_DETAILED_EVIDENCE_LIMITS = {
	...DESIGN_EVIDENCE_LIMITS,
	elements: 500,
	scanElements: 10000,
	fonts: 100,
	variables: 200,
} as const;

export type DesignEvidenceLimits = {
	[Key in keyof typeof DESIGN_EVIDENCE_LIMITS]: number;
};

const visualViewSchema = z.strictObject({
	version: z.literal(1),
	sourceUrl: z.string().max(4096),
	capturedAt: z.iso.datetime(),
	viewport: z.strictObject({
		width: z.number().positive(),
		height: z.number().positive(),
	}),
	elements: z
		.array(
			z.strictObject({
				selector: z.string().min(1).max(DESIGN_EVIDENCE_LIMITS.selectorChars),
				role: z.string().max(40),
				text: z.string().max(120),
				width: z.number().positive(),
				height: z.number().positive(),
				properties: z.record(
					z.string().max(100),
					z.string().max(DESIGN_EVIDENCE_LIMITS.valueChars),
				),
				variables: z
					.record(
						z.string().regex(/^--[\w-]+$/),
						z.string().max(DESIGN_EVIDENCE_LIMITS.valueChars),
					)
					.optional(),
			}),
		)
		.max(DESIGN_DETAILED_EVIDENCE_LIMITS.elements),
	fonts: z
		.array(
			z.strictObject({
				family: z.string().max(500),
				weight: z.string().max(100),
				status: z.enum(["unloaded", "loading", "loaded", "error"]),
			}),
		)
		.max(DESIGN_DETAILED_EVIDENCE_LIMITS.fonts),
	limitations: z.array(z.string().max(1000)).max(20),
	colorScheme: z.enum(["auto", "light", "dark"]).optional(),
});

export const visualEvidenceSchema = visualViewSchema.extend({
	settings: designSettingsSchema.optional(),
	additionalViews: z
		.array(visualViewSchema)
		.max(SCRAPE_LIMITS.designViews - 1)
		.optional(),
});

export type ValidatedVisualEvidence = z.infer<typeof visualEvidenceSchema>;

export function parseVisualEvidence(
	value: unknown,
): ValidatedVisualEvidence | null {
	const result = visualEvidenceSchema.safeParse(value);
	return result.success ? result.data : null;
}
