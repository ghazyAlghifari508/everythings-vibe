import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
	resolveStudioDesignSkill,
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
} from "../services/studio-design-skill-registry.server";
import { buildStudioSkillContext } from "../services/studio-skill-context.server";
import { STUDIO_SKILL_MANIFEST } from "../services/studio-skill-manifest";
import { lookupUiUxProMaxDesignSystem } from "../services/ui-ux-pro-max-lookup";
import { STUDIO_SKILL_STAGE_BUDGET_CHARS } from "../types/studio-constants";

for (const manifest of Object.values(STUDIO_SKILL_MANIFEST)) {
	const resolved = resolveStudioDesignSkill(manifest.id);
	for (const doc of [
		manifest.primaryDocument,
		...manifest.referenceDocuments,
		...manifest.datasets,
	]) {
		if (!doc) continue;
		const content = readFileSync(
			new URL(`../../../../${doc.path}`, import.meta.url),
		);
		assert.equal(content.length, doc.sizeBytes, doc.path);
		assert.equal(
			createHash("sha256").update(content).digest("hex"),
			doc.sha256,
			doc.path,
		);
		if (doc === manifest.primaryDocument)
			assert.ok(resolved.guidance.includes(content.toString("utf8")));
	}
	assert.equal(resolved.sourceRevision, manifest.pinnedRevision || null);
	if (manifest.id !== "none") {
		// Stage prompts deliver whole verbatim sections, bounded by the stage budget.
		for (const stage of [
			"planning",
			"frame",
			"correction",
			"revision",
		] as const) {
			const context = buildStudioSkillContext(manifest.id, { stage });
			assert.ok(context.sections.length > 0, `${manifest.id}/${stage}`);
			assert.ok(
				context.plan.characterCount <= STUDIO_SKILL_STAGE_BUDGET_CHARS[stage],
				`${manifest.id}/${stage} exceeds its stage budget`,
			);
			for (const section of context.sections) {
				assert.ok(context.guidance.includes(section.text), section.key);
			}
		}
		assert.ok(
			resolveStudioPlanningSystemPrompt(manifest.id).includes(
				manifest.pinnedRevision,
			),
		);
		assert.ok(
			resolveStudioFrameSystemPrompt(manifest.id).includes(
				manifest.pinnedRevision,
			),
		);
	}
}
assert.equal(resolveStudioDesignSkill("none").guidance, "");
const recommendation = lookupUiUxProMaxDesignSystem(
	"healthcare medical clinic",
);
assert.ok(recommendation.colorPalette);
assert.ok(recommendation.typography);
assert.ok(recommendation.tailwindBestPractices.length);
assert.ok(recommendation.highPriorityUxGuidelines.length);
console.info("Native Studio skills, integrity, prompts and datasets verified");
