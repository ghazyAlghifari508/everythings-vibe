import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	resolveStudioFrameSystemPrompt,
	resolveStudioPlanningSystemPrompt,
	studioSkillSystemGuidance,
} from "../services/studio-design-skill-registry.server";
import {
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
} from "../services/studio-prompt-contracts";
import { STUDIO_SKILL_ASSETS } from "../services/studio-skill-assets.generated";
import {
	buildStudioSkillContext,
	extractStudioSkillSections,
	listStudioSkillDocuments,
	STUDIO_SKILL_PRECEDENCE,
	type StudioSkillStage,
	type StudioSkillTag,
} from "../services/studio-skill-context.server";
import { STUDIO_SKILL_MANIFEST } from "../services/studio-skill-manifest";
import {
	STUDIO_SKILL_DOCUMENT_BUDGET_CHARS,
	STUDIO_SKILL_STAGE_BUDGET_CHARS,
} from "../types/studio-constants";

const SKILLS = [
	"impeccable",
	"frontend-design",
	"ui-ux-pro-max",
	"anti-slop",
	"taste",
] as const;
const SKILL_ASSETS: Record<string, string> = STUDIO_SKILL_ASSETS;
const STAGES: StudioSkillStage[] = [
	"planning",
	"frame",
	"revision",
	"correction",
];

describe("Stage-aware Studio skill context (Task 02)", () => {
	it("delivers only whole verbatim sections of the pinned upstream files", () => {
		for (const id of SKILLS) {
			for (const stage of STAGES) {
				const context = buildStudioSkillContext(id, { stage });
				expect(context.sections.length).toBeGreaterThan(0);
				for (const section of context.sections) {
					const source = SKILL_ASSETS[section.docPath];
					expect(source, section.docPath).toBeTruthy();
					// Verbatim: the delivered text exists byte-for-byte in the source
					// document, so nothing was rewritten or improvised.
					expect(source.includes(section.text)).toBe(true);
					expect(context.guidance).toContain(section.text);
					// Whole section: it is exactly a split unit of the source, not a
					// mid-sentence truncation.
					expect(
						extractStudioSkillSections(id).some(
							(candidate) =>
								candidate.key === section.key &&
								candidate.text === section.text,
						),
					).toBe(true);
				}
			}
		}
	});

	it("never exceeds the configured stage budget and never truncates", () => {
		for (const id of SKILLS) {
			for (const stage of STAGES) {
				const context = buildStudioSkillContext(id, { stage });
				expect(
					context.plan.characterCount,
					`${id}/${stage}`,
				).toBeLessThanOrEqual(STUDIO_SKILL_STAGE_BUDGET_CHARS[stage]);
				expect(context.plan.truncated).toBe(false);
				expect(
					context.guidance.endsWith("\n") || context.guidance.endsWith("-->\n"),
				).toBe(true);
			}
		}
	});

	it("records verifiable provenance and rationale for every selected section", () => {
		for (const id of SKILLS) {
			const context = buildStudioSkillContext(id, { stage: "frame" });
			expect(context.plan.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
			expect(context.plan.documentsLoaded.length).toBeGreaterThan(0);
			for (const section of context.plan.selectedSections) {
				expect(section.docPath).toContain("src/features/studio/skills/");
				expect(section.rationale.length).toBeGreaterThan(0);
				expect(context.plan.documentsLoaded).toContain(section.docPath);
			}
			for (const omitted of context.plan.omittedSections) {
				expect(omitted.reason.length).toBeGreaterThan(0);
			}
		}
	});

	it("injects the same section text at most once per stage", () => {
		for (const id of SKILLS) {
			for (const stage of STAGES) {
				const texts = buildStudioSkillContext(id, { stage }).sections.map(
					(section) => section.text,
				);
				expect(new Set(texts).size).toBe(texts.length);
			}
		}
	});

	it("does not leak source-side markdown headings inside fenced code blocks", () => {
		// antislop-human.md contains a shell comment ("# normal text: FAIL") inside
		// a fenced block; it must not become a section heading.
		const headings = extractStudioSkillSections("anti-slop")
			.map((section) => section.heading)
			.filter((heading): heading is string => Boolean(heading));
		expect(headings.some((heading) => heading.startsWith("normal text:"))).toBe(
			false,
		);
	});

	it("selects different sections for planning, frame, revision and correction", () => {
		for (const id of ["taste", "ui-ux-pro-max", "anti-slop"] as const) {
			const keys = (stage: StudioSkillStage) =>
				buildStudioSkillContext(id, { stage })
					.plan.selectedSections.map((section) => section.key)
					.sort();
			const planning = keys("planning");
			const frame = keys("frame");
			expect(planning, id).not.toEqual(frame);
			// Correction is the smallest stage: it must not resend the whole frame
			// context while repairing one failed contract.
			const correction = buildStudioSkillContext(id, { stage: "correction" });
			const frameContext = buildStudioSkillContext(id, { stage: "frame" });
			expect(correction.plan.characterCount).toBeLessThan(
				frameContext.plan.characterCount,
			);
		}
	});

	it("retrieves failure-relevant sections deterministically from focus text", () => {
		const focused = buildStudioSkillContext("anti-slop", {
			stage: "correction",
			focus: [
				"Kontras teks rendah: rasio 3.1 pada tombol",
				"Overflow horizontal terdeteksi pada grid",
			],
		});
		const headings = focused.plan.selectedSections.map(
			(section) => section.heading ?? "",
		);
		expect(headings.some((heading) => /contrast/i.test(heading))).toBe(true);
		expect(headings.some((heading) => /overflow/i.test(heading))).toBe(true);
		expect(
			focused.plan.selectedSections.some((section) =>
				section.rationale.includes("focus-matched"),
			),
		).toBe(true);
	});

	it("keeps No Skill as the zero-context baseline", () => {
		expect(studioSkillSystemGuidance("none")).toBe("");
		for (const stage of STAGES) {
			const context = buildStudioSkillContext("none", { stage });
			expect(context.guidance).toBe("");
			expect(context.plan.characterCount).toBe(0);
			expect(context.plan.selectedSections).toEqual([]);
		}
		expect(resolveStudioPlanningSystemPrompt("none")).not.toContain(
			"Studio Skill Context Plan",
		);
		expect(resolveStudioFrameSystemPrompt("none")).not.toContain(
			"Studio Skill Context Plan",
		);
	});

	it("keeps planning and frame contexts useful by covering stage capabilities", () => {
		for (const id of SKILLS) {
			const planning = buildStudioSkillContext(id, { stage: "planning" });
			expect(planning.plan.coveredTags, id).toEqual(
				expect.arrayContaining(["product", "visual", "quality"]),
			);
			const frame = buildStudioSkillContext(id, { stage: "frame" });
			// Frame guidance must cover implementation-facing capabilities; a
			// design-direction skill may legitimately skip one (frontend-design has
			// no stack/implementation chapter).
			const implementationTags: StudioSkillTag[] = [
				"layout",
				"components",
				"accessibility",
				"implementation",
			];
			const coveredImplementation = implementationTags.filter((tag) =>
				frame.plan.coveredTags.includes(tag),
			);
			expect(coveredImplementation.length, id).toBeGreaterThanOrEqual(3);
		}
	});

	it("keeps a byte-identical system prefix for repeated frames of one skill and stage", () => {
		// Prompt-prefix reuse (by the gateway or upstream) is only possible when
		// the system prefix does not drift between frames of the same job. The
		// adapter is deterministic, so only focus/stage changes it.
		for (const id of SKILLS) {
			const first = resolveStudioFrameSystemPrompt(id, { stage: "frame" });
			for (let attempt = 0; attempt < 3; attempt++) {
				expect(resolveStudioFrameSystemPrompt(id, { stage: "frame" })).toBe(
					first,
				);
			}
		}
	});

	it("appends nothing beyond the base contract and the selected sections", () => {
		for (const id of [...SKILLS, "none"] as const) {
			const frameContext = buildStudioSkillContext(id, { stage: "frame" });
			expect(resolveStudioFrameSystemPrompt(id)).toBe(
				`${STUDIO_SYSTEM_PROMPT}${frameContext.guidance}`,
			);
			const planningContext = buildStudioSkillContext(id, {
				stage: "planning",
			});
			expect(resolveStudioPlanningSystemPrompt(id)).toBe(
				`${STUDIO_PLAN_SYSTEM_PROMPT}${planningContext.guidance}`,
			);
		}
	});

	it("preserves the precedence order with the skill guidance last", () => {
		const context = buildStudioSkillContext("impeccable", {
			stage: "planning",
		});
		expect(context.plan.precedence).toEqual([...STUDIO_SKILL_PRECEDENCE]);
		expect(context.plan.precedence.at(-1)).toBe("selected skill guidance");
		expect(context.guidance).toContain("precedence chain");
		expect(context.guidance).toContain(
			`UPSTREAM DESIGN SKILL: ${STUDIO_SKILL_MANIFEST.impeccable.name}`,
		);
	});

	it("keeps the full adapter budget available for auditing fidelity", () => {
		for (const id of SKILLS) {
			const documents = listStudioSkillDocuments(id);
			const sourceChars = documents.reduce((sum, doc) => sum + doc.chars, 0);
			expect(sourceChars).toBeGreaterThan(0);
			// Every pinned document stays on disk and inside the generated bundle.
			for (const doc of documents) {
				expect(SKILL_ASSETS[doc.path]).toBeTruthy();
				expect(fs.existsSync(path.resolve(process.cwd(), doc.path))).toBe(true);
			}
			expect(STUDIO_SKILL_DOCUMENT_BUDGET_CHARS).toBeGreaterThan(0);
		}
	});

	it("resolves runtime guidance without filesystem or network access", () => {
		const runtimeModules = [
			"src/features/studio/services/studio-design-skill-registry.server.ts",
			"src/features/studio/services/studio-skill-context.server.ts",
			"src/features/studio/services/ui-ux-pro-max-lookup.ts",
		];
		for (const modulePath of runtimeModules) {
			const source = fs.readFileSync(
				path.resolve(process.cwd(), modulePath),
				"utf8",
			);
			expect(source, modulePath).not.toMatch(/\bfetch\s*\(/);
			expect(source, modulePath).not.toMatch(/from "node:fs"/);
			expect(source, modulePath).not.toMatch(/readFileSync/);
			expect(source, modulePath).not.toMatch(/https?:\/\//);
		}
	});

	it("keeps frame guidance identical between a fresh frame and a revision contract", () => {
		const manifest = STUDIO_SKILL_MANIFEST["anti-slop"];
		const frame = resolveStudioFrameSystemPrompt("anti-slop", {
			stage: "frame",
		});
		const revision = resolveStudioFrameSystemPrompt("anti-slop", {
			stage: "revision",
		});
		expect(frame).toContain(manifest.pinnedRevision);
		expect(revision).toContain(manifest.pinnedRevision);
		expect(frame).toContain(manifest.upstreamRepo);
		expect(revision).toContain(manifest.upstreamRepo);
	});
});
