import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { STUDIO_SKILL_ASSETS } from "../services/studio-skill-assets.generated";
import { STUDIO_SKILL_MANIFEST } from "../services/studio-skill-manifest";

it("bundles every pinned document and dataset byte-for-byte", () => {
	const assets: Record<string, string> = STUDIO_SKILL_ASSETS;
	const paths: string[] = [];
	for (const skill of Object.values(STUDIO_SKILL_MANIFEST)) {
		for (const doc of [
			skill.primaryDocument,
			...skill.referenceDocuments,
			...skill.datasets,
		]) {
			if (!doc) continue;
			paths.push(doc.path);
			const content = assets[doc.path];
			assert.ok(content?.length, doc.path);
			assert.equal(Buffer.byteLength(content), doc.sizeBytes, doc.path);
			assert.equal(
				createHash("sha256").update(content).digest("hex"),
				doc.sha256,
				doc.path,
			);
			assert.equal(
				content,
				readFileSync(
					new URL(`../../../../${doc.path}`, import.meta.url),
					"utf8",
				),
			);
		}
	}
	assert.deepEqual(Object.keys(assets).sort(), paths.sort());
});
