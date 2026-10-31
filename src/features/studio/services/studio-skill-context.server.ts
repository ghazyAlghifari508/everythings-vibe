import {
	STUDIO_CHARS_PER_TOKEN_ESTIMATE,
	STUDIO_SKILL_STAGE_BUDGET_CHARS,
} from "@/features/studio/types/studio-constants";
import type { StudioDesignSkillId } from "./studio-generation-options";
import { STUDIO_SKILL_ASSETS } from "./studio-skill-assets.generated";
import {
	STUDIO_SKILL_MANIFEST,
	type StudioSkillManifestEntry,
} from "./studio-skill-manifest";

// Widened because document paths are resolved from the manifest at runtime; the
// generated bundle is keyed by the exact pinned paths.
const SKILL_ASSETS: Record<string, string> = STUDIO_SKILL_ASSETS;

/**
 * Stage-aware delivery layer over the pinned upstream skill documents.
 *
 * This is an ADAPTER, not a replacement skill: it only ever selects whole,
 * verbatim sections from the documents recorded in STUDIO_SKILL_MANIFEST and
 * labels each one with its origin. It never rewrites, summarizes, or invents
 * guidance, so the upstream identity and integrity stay verifiable.
 */
export type StudioSkillStage = keyof typeof STUDIO_SKILL_STAGE_BUDGET_CHARS;

export type StudioSkillTag =
	| "product"
	| "visual"
	| "layout"
	| "components"
	| "accessibility"
	| "implementation"
	| "quality"
	| "meta";

type SkillTag = StudioSkillTag;

const TAG_PATTERNS: Array<{ tag: SkillTag; pattern: RegExp }> = [
	{
		tag: "meta",
		pattern:
			/install|wizard|setup|command|search tool|query contract|example workflow|tips|output formats|usage mode|already installed|license|attribution/i,
	},
	{
		tag: "accessibility",
		pattern:
			/accessib|a11y|contrast|keyboard|focus|zoom|reduced motion|human|tap target|touch/i,
	},
	{
		tag: "quality",
		pattern:
			/\brule|\bgate|craftsmanship|slop|anti-pattern|warning|mandatory|refuse|verify|quality|self-critique|restraint|forbidden|checklist|bar\b|principle/i,
	},
	{
		tag: "product",
		pattern:
			/when to apply|brief|subject matter|product|requirement|workflow|process|plan|scope|read the room|use-case|preset|category|priorit/i,
	},
	{
		tag: "visual",
		pattern:
			/visual|color|palette|typograph|type\b|font|style|aesthetic|material|shadow|gradient|glass|glow|theme|dark|light|calibration/i,
	},
	{
		tag: "layout",
		pattern:
			/layout|spacing|grid|responsive|mobile|breakpoint|overflow|density|stack|rhythm|sizing|hierarchy|structure|navigation|shell/i,
	},
	{
		tag: "components",
		pattern:
			/component|card|form|input|button|icon|interaction|pattern|chart|table|feedback|motion|animation|data\b/i,
	},
	{
		tag: "implementation",
		pattern:
			/stack|tailwind|dependen|html|\bcode\b|implement|performance|guardrail|deliver|pre-delivery|output/i,
	},
];

const STAGE_TAG_WEIGHTS: Record<StudioSkillStage, Record<SkillTag, number>> = {
	planning: {
		product: 5,
		visual: 4,
		components: 2,
		accessibility: 1,
		quality: 4,
		layout: 2,
		implementation: 1,
		meta: 0,
	},
	frame: {
		product: 1,
		visual: 4,
		components: 5,
		accessibility: 4,
		quality: 3,
		layout: 5,
		implementation: 4,
		meta: 0,
	},
	revision: {
		product: 2,
		visual: 5,
		components: 4,
		accessibility: 3,
		quality: 4,
		layout: 4,
		implementation: 1,
		meta: 0,
	},
	correction: {
		product: 0,
		visual: 2,
		components: 4,
		accessibility: 5,
		quality: 6,
		layout: 4,
		implementation: 3,
		meta: 0,
	},
};

// Identity sections are always delivered regardless of stage so the skill keeps
// its own voice instead of degrading into anonymous tips. Matched on the pinned
// heading text of the current revisions recorded in STUDIO_SKILL_MANIFEST.
const CORE_SECTION_PATTERNS: Record<
	Exclude<StudioDesignSkillId, "none">,
	RegExp[]
> = {
	impeccable: [
		/^how to design$/i,
		/^modes$/i,
		/^craft floor$/i,
		/^verify$/i,
		/^refuse$/i,
	],
	"frontend-design": [
		/^ground your designs/i,
		/^design principles$/i,
		/^process:/i,
		/^restraint and self-critique$/i,
	],
	"ui-ux-pro-max": [/^when to apply$/i, /^rule categories by priority$/i],
	"anti-slop": [
		/^core principle$/i,
		/^the craftsmanship standard$/i,
		/^group 1: hard gate/i,
		/^delivery gate/i,
	],
	taste: [
		/^0\. brief inference/i,
		/^1\. the three dials/i,
		/^4\. design engineering directives/i,
	],
};

const PLAN_BLOCK_RESERVE_CHARS = 600;
// Budget allowance for the one-line provenance marker each section carries.
const STUDIO_SKILL_SECTION_MARKER_CHARS = 70;

export interface StudioSkillSection {
	key: string;
	docPath: string;
	docTitle: string;
	kind: "primary" | "reference";
	level: number;
	heading: string | null;
	text: string;
	chars: number;
	order: number;
}

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

interface SkillDocument {
	path: string;
	title: string;
	kind: "primary" | "reference";
	text: string;
	priority: number;
}

export const STUDIO_SKILL_PRECEDENCE = [
	"security and runtime constraints",
	"explicit user requirements",
	"PRD / project context",
	"DESIGN.md / active design reference",
	"existing shared blueprint",
	"selected skill guidance",
] as const;

function skillDocuments(id: StudioDesignSkillId): SkillDocument[] {
	const manifest = STUDIO_SKILL_MANIFEST[id];
	const docs: SkillDocument[] = [];
	if (manifest.primaryDocument) {
		const text = SKILL_ASSETS[manifest.primaryDocument.path];
		if (text)
			docs.push({
				path: manifest.primaryDocument.path,
				title: manifest.name,
				kind: "primary",
				text,
				priority: 0,
			});
	}
	for (const ref of manifest.referenceDocuments) {
		const text = SKILL_ASSETS[ref.path];
		if (text)
			docs.push({
				path: ref.path,
				title: ref.title,
				kind: "reference",
				text,
				priority: ref.priority,
			});
	}
	return docs;
}

/**
 * Splits a markdown document on ATX headings, ignoring `#` lines inside fenced
 * code blocks (several upstream files contain shell comments starting with #).
 * Every returned section is a contiguous verbatim slice of the source document.
 */
function splitStudioSkillSections(doc: SkillDocument): StudioSkillSection[] {
	const sections: StudioSkillSection[] = [];
	let buffer: string[] = [];
	let level = 0;
	let heading: string | null = null;
	let order = 0;
	let inFence = false;

	const flush = () => {
		if (buffer.length === 0) return;
		const text = buffer.join("\n").trim();
		buffer = [];
		if (text.length === 0) return;
		sections.push({
			key: `${doc.path}#${heading ? slug(heading) : "preamble"}`,
			docPath: doc.path,
			docTitle: doc.title,
			kind: doc.kind,
			level,
			heading,
			text,
			chars: text.length,
			order: order++,
		});
	};

	for (const line of doc.text.split("\n")) {
		if (/^\s*```/.test(line)) inFence = !inFence;
		const match = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
		if (match) {
			flush();
			level = match[1].length;
			heading = match[2].trim();
			buffer.push(line);
			continue;
		}
		buffer.push(line);
	}
	flush();
	return sections;
}

function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function classifySection(heading: string | null, text: string): SkillTag[] {
	// A short body sample keeps prose-headed sections (frontend-design) from
	// looking capability-blind while staying deterministic and cheap.
	const sample = `${heading ?? ""}\n${text.slice(0, 280)}`;
	const tags: SkillTag[] = [];
	for (const { tag, pattern } of TAG_PATTERNS) {
		if (pattern.test(sample)) tags.push(tag);
	}
	return tags.length > 0 ? tags : ["product"];
}

// Deterministic bridge between the Indonesian runtime failure vocabulary and the
// English upstream headings. It only widens retrieval; it never introduces new
// guidance.
const FOCUS_SYNONYMS: Record<string, string[]> = {
	kontras: ["contrast"],
	navigasi: ["navigation", "nav"],
	nav: ["navigation"],
	tipografi: ["typography", "font"],
	font: ["typography"],
	letak: ["layout"],
	tata: ["layout"],
	jarak: ["spacing", "gap"],
	lebar: ["width", "overflow"],
	luap: ["overflow"],
	meluap: ["overflow"],
	terpotong: ["overflow", "clip"],
	kosong: ["empty", "content"],
	hilang: ["missing"],
	ganda: ["duplicate"],
	tumpang: ["overlap", "sticky"],
	teks: ["text", "typography"],
	gambar: ["image", "asset"],
	tombol: ["button"],
	aksesibilitas: ["accessibility", "a11y"],
	kontrak: ["contract", "rule"],
	masukan: ["input", "form"],
	warna: ["color"],
	gelap: ["dark"],
	terang: ["light"],
	resolusi: ["responsive"],
	responsif: ["responsive"],
	markdown: ["markdown", "artefak"],
	viewport: ["viewport", "width"],
};

function focusTokens(focus: string[] | undefined): string[] {
	if (!focus?.length) return [];
	const tokens = new Set<string>();
	for (const line of focus) {
		for (const raw of line.toLowerCase().split(/[^a-z0-9]+/)) {
			if (raw.length < 4) continue;
			tokens.add(raw);
			for (const synonym of FOCUS_SYNONYMS[raw] ?? []) tokens.add(synonym);
		}
	}
	return [...tokens];
}

function scoreSection(
	section: StudioSkillSection,
	stage: StudioSkillStage,
	tokens: string[],
): { score: number; rationale: string } {
	const tags = classifySection(section.heading, section.text);
	if (tags.includes("meta")) {
		return { score: 0, rationale: `stage=${stage} tags=meta score=0` };
	}
	let base = 0;
	for (const tag of tags) base = Math.max(base, STAGE_TAG_WEIGHTS[stage][tag]);
	let bonus = 0;
	if (section.heading) {
		const lower = section.heading.toLowerCase();
		for (const token of tokens) if (lower.includes(token)) bonus += 5;
	} else {
		bonus += 2;
	}
	if (tokens.length > 0) {
		const body = section.text.toLowerCase();
		for (const token of tokens) if (body.includes(token)) bonus += 1;
	}
	return {
		score: base + bonus,
		rationale: `stage=${stage} tags=${tags.length ? tags.join("|") : "none"} score=${base + bonus}${bonus > 0 ? " focus-matched" : ""}`,
	};
}

function isCoreSection(
	id: Exclude<StudioDesignSkillId, "none">,
	section: StudioSkillSection,
	stage: StudioSkillStage,
): boolean {
	const tags = classifySection(section.heading, section.text);
	if (tags.includes("meta")) return false;
	if (section.level <= 1 && section.heading === null) return true;
	if (!section.heading) return false;
	if (
		stage === "planning" &&
		id === "anti-slop" &&
		/delivery gate/i.test(section.heading)
	) {
		return false;
	}
	return CORE_SECTION_PATTERNS[id].some((pattern) =>
		pattern.test(section.heading ?? ""),
	);
}

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
			"[Scope Adapter Note]: Apply transferable aesthetic principles (typography scale, spatial rhythm, intentional contrast, content density). Landing-page-only quotas or motion prescriptions do not apply to multi-screen dashboard or mobile app frames.",
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
	const ordered: StudioSkillSection[] = [];
	const rationaleByKey = new Map<string, string>();
	const selectedKeys = new Set<string>();
	let used = 0;
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

	for (const section of allSections) {
		if (section.docPath !== primary.path) continue;
		const tags = classifySection(section.heading, section.text);
		if (tags.includes("meta")) continue;
		if (section.level <= 1) consider(section, "core-identity", true);
	}
	for (const section of allSections) {
		if (section.docPath !== primary.path || selectedKeys.has(section.key))
			continue;
		if (isCoreSection(id, section, stage))
			consider(section, "core-identity", false);
	}
	for (const entry of ranked) consider(entry.section, entry.rationale, false);

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
