import type { STUDIO_SKILL_STAGE_BUDGET_CHARS } from "@/features/studio/types/studio-constants";
import type { StudioDesignSkillId } from "./studio-generation-options";
import { STUDIO_SKILL_ASSETS } from "./studio-skill-assets.generated";
import { STUDIO_SKILL_MANIFEST } from "./studio-skill-manifest";

/**
 * Verbatim section model and stage-aware relevance scoring for the pinned
 * upstream design-skill documents. Pure and deterministic: no I/O, no network.
 * Selection only ever keeps whole upstream sections, never partial text.
 */
// Widened because document paths are resolved from the manifest at runtime; the
// generated bundle is keyed by the exact pinned paths.
const SKILL_ASSETS: Record<string, string> = STUDIO_SKILL_ASSETS;

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
	taste: [/^page or app screen/i, /^house rules$/i, /^laws of the craft$/i],
};

// Budget allowance for the one-line provenance marker each section carries.
export const STUDIO_SKILL_SECTION_MARKER_CHARS = 70;

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

export interface SkillDocument {
	path: string;
	title: string;
	kind: "primary" | "reference";
	text: string;
	priority: number;
}

export function skillDocuments(id: StudioDesignSkillId): SkillDocument[] {
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
export function splitStudioSkillSections(
	doc: SkillDocument,
): StudioSkillSection[] {
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

export function classifySection(
	heading: string | null,
	text: string,
): SkillTag[] {
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
	dashboard: ["dashboard", "admin", "overview"],
	tabel: ["table", "list", "tabular"],
	grafik: ["chart", "series"],
	kpi: ["kpi", "metric", "delta"],
	formulir: ["form", "settings", "input"],
};

export function focusTokens(focus: string[] | undefined): string[] {
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

export function scoreSection(
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
		// Heading matches are worth more than body matches: a section titled
		// "Overflow" is directly about the failure, while a section that merely
		// mentions "overflow" in passing may be about something else entirely.
		// This ensures focus-relevant sections from reference docs compete with
		// high-tag-score sections from the primary doc in tight correction budgets.
		if (section.heading) {
			const lowerHeading = section.heading.toLowerCase();
			for (const token of tokens) if (lowerHeading.includes(token)) bonus += 8;
		}
	}
	return {
		score: base + bonus,
		rationale: `stage=${stage} tags=${tags.length ? tags.join("|") : "none"} score=${base + bonus}${bonus > 0 ? " focus-matched" : ""}`,
	};
}

export function isCoreSection(
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
