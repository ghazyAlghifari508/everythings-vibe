import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
	resolveStudioDesignSkill,
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
} from "../services/studio-design-skill-registry.server";
import { STUDIO_SKILL_MANIFEST } from "../services/studio-skill-manifest";
import { lookupUiUxProMaxDesignSystem } from "../services/ui-ux-pro-max-lookup";

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
	assert.ok(
		resolveStudioPlanningSystemPrompt(manifest.id).includes(resolved.guidance),
	);
	assert.ok(
		resolveStudioFrameSystemPrompt(manifest.id).includes(resolved.guidance),
	);
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
