import {
	STUDIO_CHARS_PER_TOKEN_ESTIMATE,
	STUDIO_SKILL_STAGE_BUDGET_CHARS,
} from "@/features/studio/types/studio-constants";
import type { StudioDesignSkillId } from "./studio-generation-options";
import {
	STUDIO_SKILL_MANIFEST,
	type StudioSkillManifestEntry,
} from "./studio-skill-manifest";
import {
	classifySection,
	focusTokens,
	isCoreSection,
	type SkillDocument,
	STUDIO_SKILL_SECTION_MARKER_CHARS,
	type StudioSkillSection,
	type StudioSkillStage,
	type StudioSkillTag,
	scoreSection,
	skillDocuments,
	splitStudioSkillSections,
} from "./studio-skill-selection.server";

// Section model and stage relevance scoring live in the selection module; this
// module owns prompt assembly and re-exports the public section types so existing
// consumers keep importing them from here.
export type {
	StudioSkillSection,
	StudioSkillStage,
	StudioSkillTag,
} from "./studio-skill-selection.server";

/**
 * Stage-aware delivery layer over the pinned upstream skill documents.
 *
 * This is an ADAPTER, not a replacement skill: it only ever selects whole,
 * verbatim sections from the documents recorded in STUDIO_SKILL_MANIFEST and
 * labels each one with its origin. It never rewrites, summarizes, or invents
 * guidance, so the upstream identity and integrity stay verifiable.
 */
const PLAN_BLOCK_RESERVE_CHARS = 600;
interface StudioSkillSelectedSection {
	key: string;
	docPath: string;
	heading: string | null;
	level: number;
	chars: number;
	rationale: string;
}

interface StudioSkillOmittedSection {
	key: string;
	docPath: string;
	heading: string | null;
	chars: number;
	reason: string;
}

interface StudioSkillContextPlan {
	skillId: StudioDesignSkillId;
	name: string;
	stage: StudioSkillStage;
	sourceRevision: string | null;
	adapterVersion: number;
	license: string;
	budgetChars: number;
	characterCount: number;
	estimatedTokens: number;
	documentsLoaded: string[];
	selectedSections: StudioSkillSelectedSection[];
	omittedSections: StudioSkillOmittedSection[];
	omittedDocuments: string[];
	/** capability tags actually covered by the delivered sections */
	coveredTags: StudioSkillTag[];
	truncated: false;
	precedence: string[];
}

export interface StudioSkillContext {
	guidance: string;
	plan: StudioSkillContextPlan;
	sections: StudioSkillSection[];
}

export const STUDIO_SKILL_PRECEDENCE = [
	"security and runtime constraints",
	"explicit user requirements",
	"PRD / project context",
	"DESIGN.md / active design reference",
	"existing shared blueprint",
	"selected skill guidance",
] as const;

function adapterHeaderLines(
	manifest: StudioSkillManifestEntry,
	docs: SkillDocument[],
): string[] {
	const lines = [
		"",
		"================================================================================",
		`UPSTREAM DESIGN SKILL: ${manifest.name} (Pinned Revision: ${manifest.pinnedRevision})`,
		`Selected design skill: ${manifest.id} (Studio adapter v${manifest.adapterVersion}). Apply this visual guidance within the output, safety, platform and selected design-reference contract; do not add commentary or executable behavior.`,
		`License: ${manifest.license} | Studio Adapter v${manifest.adapterVersion}`,
		`Reference documents available: ${
			docs
				.filter((doc) => doc.kind === "reference")
				.map((doc) => `${doc.title} (${doc.path.split("/").pop()})`)
				.join(", ") || "none"
		}`,
		"--------------------------------------------------------------------------------",
		"[Studio Compatibility Adapter Note]:",
		`The sections below are verbatim upstream guidance from ${manifest.upstreamRepo}@${manifest.pinnedRevision}, selected per stage. No text is rewritten.`,
		"Apply this guidance only where the request's precedence chain allows: safety and platform validity first, selected design skill guidance last.",
		"Generate pure HTML with Tailwind CSS and standard inline SVG icons. Do not execute scripts or create external files.",
	];

	if (manifest.id === "impeccable") {
		lines.push(
			"[Surface Mode Note]: Surface modes (persuade, operate, read, experience) apply to screen planning and layout density. Interactive CLI commands (/impeccable audit) do not run in Studio.",
		);
	} else if (manifest.id === "frontend-design") {
		lines.push(
			"[Aesthetic Direction Note]: Ground typography, palette, and layout in the subject matter. Screenshot self-critique is validated via Studio's HTML contract validator.",
		);
	} else if (manifest.id === "ui-ux-pro-max") {
		lines.push(
			"[UX Priority Note]: Priority order (Accessibility > Touch > Responsive > Typography > Feedback) is strictly enforced. Design system recommendations matched from curated datasets are injected at planning time.",
		);
	} else if (manifest.id === "anti-slop") {
		lines.push(
			"[Purpose Filter Note]: Every element must serve hierarchy, readability, or content. Avoid decorative fluff (no nested capsules, no neon gradients, no random sparkle icons).",
		);
	} else if (manifest.id === "taste") {
		lines.push(
			"[Scope Adapter Note]: Verbatim upstream Taste v2.1.5 guidelines. For operational screens, dashboards, settings, and mobile apps, apply the App Screen Guidelines (quiet borders, data-focused color, tabular numbers, no decorative hero or marketing photo quotas). For marketing or landing pages, apply the page art direction principles.",
		);
	}
	lines.push(
		"================================================================================",
		"",
	);
	return lines;
}

function contextPlanBlock(plan: {
	stage: StudioSkillStage;
	budgetChars: number;
	selected: StudioSkillSelectedSection[];
}): string {
	const selectedChars = plan.selected.reduce(
		(sum, section) => sum + section.chars,
		0,
	);
	// Compact on purpose: full provenance for tooling lives in the returned plan
	// object and the stage timing events; the prompt only needs the guarantees.
	return `${[
		`[Studio Skill Context Plan] stage=${plan.stage} | budget=${plan.budgetChars} chars | selected=${selectedChars} chars in ${plan.selected.length} whole sections | truncation=none`,
		"selection=deterministic stage relevance over verbatim upstream sections; every section below is labelled with its origin.",
	].join(" ")}\n`;
}

function emptyPlan(
	id: StudioDesignSkillId,
	stage: StudioSkillStage,
	budgetChars: number,
): StudioSkillContextPlan {
	const manifest = STUDIO_SKILL_MANIFEST[id];
	return {
		skillId: id,
		name: manifest.name,
		stage,
		sourceRevision: manifest.pinnedRevision || null,
		adapterVersion: manifest.adapterVersion,
		license: manifest.license,
		budgetChars,
		characterCount: 0,
		estimatedTokens: 0,
		documentsLoaded: [],
		selectedSections: [],
		omittedSections: [],
		omittedDocuments: [],
		coveredTags: [],
		truncated: false,
		precedence: [...STUDIO_SKILL_PRECEDENCE],
	};
}

export function buildStudioSkillContext(
	id: StudioDesignSkillId,
	options: { stage?: StudioSkillStage; focus?: string[] } = {},
): StudioSkillContext {
	const stage = options.stage ?? "frame";
	const budgetChars = STUDIO_SKILL_STAGE_BUDGET_CHARS[stage];
	const manifest = STUDIO_SKILL_MANIFEST[id];
	if (id === "none" || !manifest.primaryDocument) {
		return {
			guidance: "",
			plan: emptyPlan(id, stage, budgetChars),
			sections: [],
		};
	}

	const docs = skillDocuments(id);
	const primary = docs.find((doc) => doc.kind === "primary") ?? docs[0];
	const allSections = docs.flatMap((doc) => splitStudioSkillSections(doc));
	const tokens = focusTokens(options.focus);
	const scored = allSections.map((section) => ({
		section,
		...scoreSection(section, stage, tokens),
	}));
	const ranked = [...scored].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.section.order - b.section.order;
	});

	const header = adapterHeaderLines(manifest, docs).join("\n");
	const available = Math.max(
		0,
		budgetChars - header.length - PLAN_BLOCK_RESERVE_CHARS,
	);

	// Greedy whole-section selection under a hard character cap. Identity
	// sections (preamble and top-level headings) are preferred but still bounded;
	// a section that does not fit is omitted in full, never cut mid-sentence.
	// In correction stage with focus tokens, prioritize failure-relevant sections
	// over generic identity to keep the repair prompt focused and small.
	const ordered: StudioSkillSection[] = [];
	const rationaleByKey = new Map<string, string>();
	const selectedKeys = new Set<string>();
	let used = 0;
	const hasFocus = tokens.length > 0;
	const consider = (
		section: StudioSkillSection,
		rationale: string,
		required: boolean,
	): void => {
		if (selectedKeys.has(section.key)) return;
		const cost = section.chars + STUDIO_SKILL_SECTION_MARKER_CHARS;
		if (!required && used + cost > available) return;
		ordered.push(section);
		rationaleByKey.set(section.key, rationale);
		selectedKeys.add(section.key);
		used += cost;
	};

	// When focus tokens exist in correction stage, skip ALL core identity
	// selection so focus-matched sections from any doc fill the budget first.
	// This ensures failure-relevant guidance (e.g. overflow, contrast) is
	// delivered instead of generic identity sections that don't help repair.
	if (!(stage === "correction" && hasFocus)) {
		for (const section of allSections) {
			if (section.docPath !== primary.path) continue;
			const tags = classifySection(section.heading, section.text);
			if (section.heading !== null && tags.includes("meta")) continue;
			if (section.level <= 1) consider(section, "core-identity", true);
		}
		for (const section of allSections) {
			if (section.docPath !== primary.path || selectedKeys.has(section.key))
				continue;
			if (isCoreSection(id, section, stage))
				consider(section, "core-identity", false);
		}
	}
	for (const entry of ranked) {
		if (entry.score <= 0) continue;
		consider(entry.section, entry.rationale, false);
	}

	const selectedSections: StudioSkillSelectedSection[] = ordered.map(
		(section) => ({
			key: section.key,
			docPath: section.docPath,
			heading: section.heading,
			level: section.level,
			chars: section.chars,
			rationale: rationaleByKey.get(section.key) ?? "ranked",
		}),
	);
	const omittedSections: StudioSkillOmittedSection[] = allSections
		.filter((section) => !selectedKeys.has(section.key))
		.map((section) => ({
			key: section.key,
			docPath: section.docPath,
			heading: section.heading,
			chars: section.chars,
			reason:
				section.chars > available
					? `section alone exceeds the ${stage} stage budget (${section.chars} chars)`
					: `${stage} stage budget filled by higher-relevance sections`,
		}));

	const contributed = new Set(selectedSections.map((s) => s.docPath));
	const omittedDocuments = docs
		.filter((doc) => !contributed.has(doc.path))
		.map((doc) => doc.path);
	const coveredTags = [
		...new Set(
			ordered.flatMap((section) =>
				classifySection(section.heading, section.text),
			),
		),
	];

	const planBlock = contextPlanBlock({
		stage,
		budgetChars,
		selected: selectedSections,
	});
	const sectionText = ordered
		.map((section, index) => {
			const fileName = section.docPath.split("/").pop();
			return [
				`<!-- upstream ${index + 1}/${ordered.length}: ${fileName} \u203a ${section.heading ?? "(preamble)"} -->`,
				section.text,
			].join("\n");
		})
		.join("\n\n");
	const guidance = sectionText
		? `${header}${planBlock}\n${sectionText}\n`
		: `${header}${planBlock}`;

	return {
		guidance,
		sections: ordered,
		plan: {
			skillId: id,
			name: manifest.name,
			stage,
			sourceRevision: manifest.pinnedRevision || null,
			adapterVersion: manifest.adapterVersion,
			license: manifest.license,
			budgetChars,
			characterCount: guidance.length,
			estimatedTokens: Math.ceil(
				guidance.length / STUDIO_CHARS_PER_TOKEN_ESTIMATE,
			),
			documentsLoaded: [...contributed],
			selectedSections,
			omittedSections,
			omittedDocuments,
			coveredTags,
			truncated: false,
			precedence: [...STUDIO_SKILL_PRECEDENCE],
		},
	};
}

export function listStudioSkillDocuments(id: StudioDesignSkillId) {
	return skillDocuments(id).map((doc) => ({
		path: doc.path,
		title: doc.title,
		kind: doc.kind,
		chars: doc.text.length,
	}));
}

/** Verbatim sections of every pinned document for a skill (test/audit surface). */
export function extractStudioSkillSections(
	id: StudioDesignSkillId,
): StudioSkillSection[] {
	return skillDocuments(id).flatMap((doc) => splitStudioSkillSections(doc));
}
