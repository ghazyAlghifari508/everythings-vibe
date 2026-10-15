import {
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
} from "./prompts-ui-studio";
import {
	type StudioDesignSkillId,
	studioDesignSkillIdSchema,
} from "./studio-generation-options";

// Adapted and abridged from pinned upstream definitions; see docs/studio-skills/NOTICE.md.
const GUIDANCE: Record<
	StudioDesignSkillId,
	{ guidance: string; sourceRevision: string | null }
> = {
	none: { guidance: "", sourceRevision: null },
	impeccable: {
		sourceRevision: "245ad82def45831dc56a21b683c7a1ff530b06cc",
		guidance:
			"Honor the brief and active design reference. The brief wins over saturated-pattern warnings; refinement preserves incumbent identity while redesign replaces the world. Choose the surface mode: persuade, operate, read, or experience. For operational screens prioritize scanability, task completion and consistent native expectations. Establish obvious type scale and weight steps, tight related groups and generous separation. Use the product's language; controls name their action and errors identify recovery. Avoid identical icon-heading-text cards as automatic scaffolding, gradient text, decorative glass, and arbitrary section numbering. Keep focus, contrast, readable measure and content-driven responsive composition deliberate.",
	},
	"frontend-design": {
		sourceRevision: "dbd4588f9e1033efb41dad4bef2f7947c8993d44",
		guidance:
			"Ground palette, typography and layout in the subject matter, audience and primary job rather than a generic template. Honor the user's pinned direction. Choose one memorable focal element and keep surrounding structure disciplined. Typography carries personality through an intentional scale, weight and spacing. Structural borders and numbering convey information, not decoration. Avoid unnecessary uppercase eyebrow labels and repetitive rounded card kits. Avoid default treatments unless the brief pins them: cream backgrounds with terracotta accents, near-black with acid-green, broadsheet hairlines, SaaS-card kits with identical rounded cards and soft grey shadow, template chrome such as ALL-CAPS eyebrows, middle-dot meta, spaced em-dash labels and trailing arrows. Use plain active product-specific language, consistent names for actions and actionable empty/error states. Maintain readable line lengths, accessible contrast and responsive layout.",
	},
	"ui-ux-pro-max": {
		sourceRevision: "7246805992a42b7bba37d4cac83b01416f0c6c44",
		guidance:
			"Apply curated UX priorities: accessibility, touch interaction, responsive layout, then typography and feedback. Give controls visible labels and meaningful accessible names; preserve keyboard focus. Normal text needs at least 4.5:1 contrast. Touch targets should be at least 44px with separation. Do not rely on hover alone. Base text 16px with line-height 1.5; motion conveys meaning and respects reduced-motion. Reserve space for media, avoid horizontal viewport overflow and use semantic color tokens consistently. Place field errors near their inputs and explain recovery. Represent loading, empty, error and disabled states honestly. Navigation must be predictable with at most five bottom destinations, back behavior and deep linking; charts need labels and must not encode meaning through color alone. This is curated guidance, not a searchable palette or font dataset.",
	},
	"anti-slop": {
		sourceRevision: "9685ca7eac70283d083fc23baa9a88e7d3cd93c4",
		guidance:
			"Apply a purpose filter to each visual decision: it must serve hierarchy, identity, readability or the product's content. This filter, not a house style, governs the result. Build composition around actual content instead of a default hero-card-statistics template. Build features directly in source, never via scripts that rewrite files or CSS. Keep one clear focal point and varied hierarchy; removing decoration must not produce a sterile empty wireframe. Avoid decorative sparkle icons, nested pill geometry, unnecessary glowing accents and repeated identical sections. Honor the active visual direction without cloning unrelated brands. Do not invent testimonials, trust claims or statistics. Label illustrative data honestly. Preserve accessible contrast, readable mobile composition and meaningful visual empty/error/loading states.",
	},
	taste: {
		sourceRevision: "d237dd399d57524945c0c81327da5da19f7a468d",
		guidance:
			"Use transferable composition guidance curated from Taste, not its full landing-page workflow. Infer visual direction from page kind, audience, existing assets and explicit constraints; accessibility outranks aesthetic preference. Avoid automatic centered hero, purple glow, glass everywhere and three equal feature cards. Establish one consistent palette, accent and corner-radius scale across the project. Use one icon family per project with a standardized stroke width. Choose typography for this brand rather than a default family; size headlines and visual assets together so hierarchy remains balanced. Cards should communicate real grouping. Use meaningful content density and explicit mobile reflow. Keep labels legible and action wording consistent. For dashboards and mobile app screens apply only these transferable principles, not landing-page quotas or animation prescriptions.",
	},
};

export interface StudioSkillCapability {
	promptCompatible: string[];
	requiresAgentTools: string[];
	searchableDatasets: boolean;
	limitations: string[];
}

const CAPABILITIES: Record<StudioDesignSkillId, StudioSkillCapability> = {
	none: {
		promptCompatible: [],
		requiresAgentTools: [],
		searchableDatasets: false,
		limitations: [],
	},
	impeccable: {
		promptCompatible: [
			"surface modes (persuade, operate, read, experience)",
			"brief-wins direction",
			"refinement vs redesign",
			"craft-floor anti-patterns",
		],
		requiresAgentTools: [
			"impeccable context script",
			"live browser iteration",
			"design detector hook",
		],
		searchableDatasets: false,
		limitations: [
			"no script execution inside Studio generation worker",
			"no live visual iteration",
		],
	},
	"frontend-design": {
		promptCompatible: [
			"subject-matter grounding",
			"single focal element",
			"typography personality",
			"structural devices as information",
			"anti-default calibration",
		],
		requiresAgentTools: [],
		searchableDatasets: false,
		limitations: [
			"screenshot self-critique is manual; Studio validates contracts only",
		],
	},
	"ui-ux-pro-max": {
		promptCompatible: [
			"accessibility priority table",
			"touch targets and contrast",
			"responsive and navigation rules",
		],
		requiresAgentTools: ["search.py local dataset lookup"],
		searchableDatasets: false,
		limitations: [
			"no searchable palettes, font pairings, styles, charts, or stacks lookup in Studio",
			"curated priority table only",
		],
	},
	"anti-slop": {
		promptCompatible: [
			"purpose filter",
			"content-driven composition",
			"honesty rules",
			"accessibility gates",
		],
		requiresAgentTools: [],
		searchableDatasets: false,
		limitations: [
			"Delivery Gate click-through requires runnable app; Studio runs contract validation only",
		],
	},
	taste: {
		promptCompatible: [
			"brief inference",
			"consistency locks",
			"transferable layout and type principles",
		],
		requiresAgentTools: ["image-generation tooling"],
		searchableDatasets: false,
		limitations: [
			"dashboard, data table, and multi-step product UI excluded upstream",
			"no landing-page quotas or motion prescriptions on app screens",
			"no generated photography inside Studio worker",
		],
	},
};

export function getStudioSkillCapability(id: unknown): StudioSkillCapability {
	const skillId = studioDesignSkillIdSchema.parse(id);
	return CAPABILITIES[skillId];
}

export function resolveStudioDesignSkill(id: unknown) {
	const skillId = studioDesignSkillIdSchema.parse(id);
	return { id: skillId, version: 2, ...GUIDANCE[skillId] };
}

export function studioSkillSystemGuidance(id: unknown): string {
	const skill = resolveStudioDesignSkill(id);
	return skill.guidance
		? `\n\nSelected design skill: ${skill.id} (Studio adapter v${skill.version}). Apply this visual guidance within the output, safety, platform and selected design-reference contract; do not add commentary or executable behavior.\n${skill.guidance}`
		: "";
}

export function buildStudioSkillSystemPrompt(
	baseSystemPrompt: string,
	id: unknown,
): string {
	return `${baseSystemPrompt}${studioSkillSystemGuidance(id)}`;
}

export function resolveStudioPlanningSystemPrompt(id: unknown): string {
	return buildStudioSkillSystemPrompt(STUDIO_PLAN_SYSTEM_PROMPT, id);
}

export function resolveStudioFrameSystemPrompt(id: unknown): string {
	return buildStudioSkillSystemPrompt(STUDIO_SYSTEM_PROMPT, id);
}
