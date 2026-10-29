import { STUDIO_CHARS_PER_TOKEN_ESTIMATE } from "@/features/studio/types/studio-constants";
import { resolveStudioDesignSkill } from "./studio-design-skill-registry.server";
import { STUDIO_SKILL_ASSETS } from "./studio-skill-assets.generated";

const SKILL_ASSETS: Record<string, string> = STUDIO_SKILL_ASSETS;

import type { StudioDesignSkillId } from "./studio-generation-options";
import {
	buildStudioSkillContext,
	listStudioSkillDocuments,
	type StudioSkillStage,
	type StudioSkillTag,
} from "./studio-skill-context.server";
import { STUDIO_SKILL_MANIFEST } from "./studio-skill-manifest";

export const STUDIO_SKILL_STAGES: StudioSkillStage[] = [
	"planning",
	"frame",
	"revision",
	"correction",
];

export const STUDIO_AUDITED_SKILL_IDS: StudioDesignSkillId[] = [
	"none",
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
];

export interface StudioSkillStageAudit {
	stage: StudioSkillStage;
	contextChars: number;
	estimatedTokens: number;
	selectedSectionCount: number;
	omittedSectionCount: number;
	documentsLoaded: number;
	coveredTags: StudioSkillTag[];
	duplicateSubstrings: number;
	nonVerbatimSections: string[];
}

export interface StudioSkillAuditRow {
	skillId: StudioDesignSkillId;
	name: string;
	sourceRevision: string | null;
	originalSourceChars: number;
	originalSourceTokens: number;
	supportingDocuments: number;
	/** legacy full-adapter assembly: the measured "before" size */
	legacyGuidanceChars: number;
	legacyTokens: number;
	legacyRepeatedDocuments: string[];
	stages: StudioSkillStageAudit[];
}

function estimatedTokens(chars: number): number {
	return Math.ceil(chars / STUDIO_CHARS_PER_TOKEN_ESTIMATE);
}

function countDuplicateTexts(texts: string[]): number {
	const seen = new Set<string>();
	let duplicates = 0;
	for (const text of texts) {
		if (seen.has(text)) duplicates++;
		seen.add(text);
	}
	return duplicates;
}

function occurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count++;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

/**
 * Deterministic, provider-free audit of how each pinned skill is delivered to
 * every generation stage. "Before" is the full-adapter assembly; "after" is the
 * stage-aware section selection. No provider call is made here, so the audit
 * reports estimated tokens only; exact provider usage is recorded separately by
 * the studio timing events when `outcome.inputTokens` is available.
 */
export function auditStudioSkillContexts(): StudioSkillAuditRow[] {
	return STUDIO_AUDITED_SKILL_IDS.map((skillId) => {
		const manifest = STUDIO_SKILL_MANIFEST[skillId];
		const documents = listStudioSkillDocuments(skillId);
		const originalSourceChars = documents.reduce(
			(sum, doc) => sum + doc.chars,
			0,
		);
		const legacy =
			skillId === "none"
				? { guidance: "", characterCount: 0 }
				: resolveStudioDesignSkill(skillId);
		const legacyRepeatedDocuments = documents
			.filter(
				(doc) => occurrences(legacy.guidance, SKILL_ASSETS[doc.path] ?? "") > 1,
			)
			.map((doc) => doc.path);

		const stages = STUDIO_SKILL_STAGES.map((stage) => {
			const context = buildStudioSkillContext(skillId, { stage });
			const nonVerbatimSections = context.sections
				.filter((section) => {
					const source = SKILL_ASSETS[section.docPath];
					return !source || !source.includes(section.text);
				})
				.map((section) => section.key);
			return {
				stage,
				contextChars: context.plan.characterCount,
				estimatedTokens: context.plan.estimatedTokens,
				selectedSectionCount: context.plan.selectedSections.length,
				omittedSectionCount: context.plan.omittedSections.length,
				documentsLoaded: context.plan.documentsLoaded.length,
				coveredTags: context.plan.coveredTags,
				duplicateSubstrings: countDuplicateTexts(
					context.sections.map((section) => section.text),
				),
				nonVerbatimSections,
			} satisfies StudioSkillStageAudit;
		});

		return {
			skillId,
			name: manifest.name,
			sourceRevision: manifest.pinnedRevision || null,
			originalSourceChars,
			originalSourceTokens: estimatedTokens(originalSourceChars),
			supportingDocuments: documents.length,
			legacyGuidanceChars: legacy.guidance.length,
			legacyTokens: estimatedTokens(legacy.guidance.length),
			legacyRepeatedDocuments,
			stages,
		} satisfies StudioSkillAuditRow;
	});
}
