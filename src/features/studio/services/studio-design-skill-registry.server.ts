import { STUDIO_SKILL_ASSETS } from "./studio-skill-assets.generated";

const antiSlopHuman =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/anti-slop/antislop-human.md"];
const antiSlopLayoutMobile =
	STUDIO_SKILL_ASSETS[
		"src/features/studio/skills/anti-slop/antislop-layoutmobile.md"
	];
const antiSlopUi =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/anti-slop/antislop-ui.md"];
const antiSlopSkill =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/anti-slop/SKILL.md"];
const frontendDesignSkill =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/frontend-design/SKILL.md"];
const impeccableCraftFloor =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/impeccable/craft-floor.md"];
const impeccableOperate =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/impeccable/operate.md"];
const impeccableSkill =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/impeccable/SKILL.md"];
const tasteSkill =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/taste/SKILL.md"];
const tasteAppScreens =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/taste/app-screens.md"];
const uiUxProMaxProRules =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/ui-ux-pro-max/pro-rules.md"];
const uiUxProMaxQuickRef =
	STUDIO_SKILL_ASSETS[
		"src/features/studio/skills/ui-ux-pro-max/quick-reference.md"
	];
const uiUxProMaxSkill =
	STUDIO_SKILL_ASSETS["src/features/studio/skills/ui-ux-pro-max/SKILL.md"];

import { STUDIO_SKILL_DOCUMENT_BUDGET_CHARS } from "../types/studio-constants";
import {
	type StudioDesignSkillId,
	studioDesignSkillIdSchema,
} from "./studio-generation-options";
import {
	STUDIO_PLAN_SYSTEM_PROMPT,
	STUDIO_SYSTEM_PROMPT,
} from "./studio-prompt-contracts";
import { STUDIO_BASE_QUALITY_PROMPT } from "./studio-quality-rules";
import {
	buildStudioSkillContext,
	type StudioSkillStage,
} from "./studio-skill-context.server";
import {
	STUDIO_SKILL_MANIFEST,
	type StudioSkillManifestEntry,
} from "./studio-skill-manifest";
import {
	formatUiUxProMaxPlanningAddendum,
	lookupUiUxProMaxDesignSystem,
} from "./ui-ux-pro-max-lookup";

export type FidelityCategory = "A" | "B" | "C" | "D";

export interface StudioSkillCapability {
	promptCompatible: string[];
	requiresAgentTools: string[];
	searchableDatasets: boolean;
	limitations: string[];
	fidelity: {
		guidance: FidelityCategory;
		references: FidelityCategory;
		datasetOrTool: FidelityCategory;
		runtimeWorkflow: FidelityCategory;
	};
}

const CAPABILITIES: Record<StudioDesignSkillId, StudioSkillCapability> = {
	none: {
		promptCompatible: [],
		requiresAgentTools: [],
		searchableDatasets: false,
		limitations: [],
		fidelity: {
			guidance: "A",
			references: "A",
			datasetOrTool: "A",
			runtimeWorkflow: "A",
		},
	},
	impeccable: {
		promptCompatible: [
			"Full upstream SKILL.md v4.5.2 (persuade, operate, read, experience)",
			"Craft-floor quality checklist (craft-floor.md)",
			"Operational screen guidelines (operate.md)",
			"Hierarchy, whitespace, type scales, and anti-patterns",
		],
		requiresAgentTools: [
			"impeccable CLI / script execution",
			"interactive /impeccable:audit loop",
			"git-aware design detectors",
		],
		searchableDatasets: false,
		limitations: [
			"Studio is an automated HTML generator; upstream CLI scripts are not executed in worker runtime",
			"Interactive terminal command workflows are inapplicable to static web prototype generation",
		],
		fidelity: {
			guidance: "A",
			references: "A",
			datasetOrTool: "C",
			runtimeWorkflow: "D",
		},
	},
	"frontend-design": {
		promptCompatible: [
			"Full upstream SKILL.md (Anthropic official)",
			"Content-grounded aesthetic direction (avoid generic templates)",
			"Typography personality and font pairings",
			"Single memorable focal element & restrained structural devices",
			"Whitespace density and motion micro-interactions",
		],
		requiresAgentTools: [],
		searchableDatasets: false,
		limitations: [
			"Upstream screenshot-based visual self-critique loop is evaluated via Studio contract validation; vision models do not run in generation worker",
		],
		fidelity: {
			guidance: "A",
			references: "A",
			datasetOrTool: "A",
			runtimeWorkflow: "C",
		},
	},
	"ui-ux-pro-max": {
		promptCompatible: [
			"Full upstream SKILL.md (Next Level Builder)",
			"Quick reference tables (quick-reference.md)",
			"Pro design rules (pro-rules.md)",
			"Curated dataset recommendations (products, styles, colors, typography, UX, tailwind)",
		],
		requiresAgentTools: ["search.py Python CLI lookup"],
		searchableDatasets: true,
		limitations: [
			"Python CLI search.py is replaced with a safe, bounded in-memory TypeScript lookup at planning time",
			"Large raw catalogs (Google fonts 747KB, icons 824KB) are excluded from direct prompt injection to preserve context budget",
		],
		fidelity: {
			guidance: "A",
			references: "A",
			datasetOrTool: "B",
			runtimeWorkflow: "D",
		},
	},
	"anti-slop": {
		promptCompatible: [
			"Full upstream SKILL.md (antislop core, 38 rules)",
			"UI & visual design rules (antislop-ui.md)",
			"Layout & mobile responsiveness (antislop-layoutmobile.md)",
			"Human accessibility & contrast (antislop-human.md)",
		],
		requiresAgentTools: [],
		searchableDatasets: false,
		limitations: [
			"Delivery Gate manual browser click-through is replaced by server-side HTML contract validation",
			"Supporting documents are bounded by the 100,000-character context budget",
		],
		fidelity: {
			guidance: "A",
			references: "A",
			datasetOrTool: "A",
			runtimeWorkflow: "D",
		},
	},
	taste: {
		promptCompatible: [
			"Full upstream SKILL.md v2.1.5 & App Screen Guidelines (app-screens.md)",
			"App screen design: data-focused color, KPI typography, flat surfaces, tabular alignment",
			"Dashboard, analytics, admin, settings, and mobile application patterns",
			"Brief inference, brand personality, and non-generic composition",
		],
		requiresAgentTools: [
			"Node/browser inspector (scripts/inspect.mjs via Chrome DevTools Protocol)",
			"Direction drawer CLI (scripts/draw.mjs)",
			"Open-collection asset downloader (scripts/assets.mjs)",
		],
		searchableDatasets: false,
		limitations: [
			"Studio is an automated HTML generator; upstream CLI scripts and CDP browser inspector are not run in worker runtime",
			"Browser-based visual inspection is replaced with deterministic TypeScript HTML contract and diagnostic validation",
			"External photo downloading and generative photography / diffusion are not available in generation worker",
		],
		fidelity: {
			guidance: "A",
			references: "A",
			datasetOrTool: "C",
			runtimeWorkflow: "D",
		},
	},
};

interface AssembledSkillGuidance {
	guidance: string;
	omittedDocuments: string[];
	characterCount: number;
	manifest: StudioSkillManifestEntry;
}

function assembleSkillGuidance(
	id: StudioDesignSkillId,
): AssembledSkillGuidance {
	const manifest = STUDIO_SKILL_MANIFEST[id];
	if (id === "none") {
		return {
			guidance: "",
			omittedDocuments: [],
			characterCount: 0,
			manifest,
		};
	}

	const parts: string[] = [];
	const omittedDocuments: string[] = [];
	let currentChars = 0;

	// 1. Studio Compatibility Adapter Header (Precedence & Scope)
	const adapterHeader = [
		`\n\n================================================================================`,
		`UPSTREAM DESIGN SKILL: ${manifest.name} (Pinned Revision: ${manifest.pinnedRevision})`,
		`Selected design skill: ${manifest.id} (Studio adapter v${manifest.adapterVersion}). Apply this visual guidance within the output, safety, platform and selected design-reference contract; do not add commentary or executable behavior.`,
		`License: ${manifest.license} | Studio Adapter v${manifest.adapterVersion}`,
		`--------------------------------------------------------------------------------`,
		`[Studio Compatibility Adapter Note]:`,
		`The following instructions are verbatim upstream guidance from ${manifest.upstreamRepo}@${manifest.pinnedRevision}.`,
		`Apply this guidance strictly within Studio's precedence hierarchy:`,
		`  1. Security and HTML safety (clean valid HTML, script-free, responsive)`,
		`  2. Explicit user prompt & requirements`,
		`  3. Valid PRD and product constraints`,
		`  4. Selected DESIGN.md and theme tokens`,
		`  5. Existing shared project blueprint`,
		`  6. Selected upstream design skill guidance (below)`,
		`  7. Default product guidance`,
		`Generate pure HTML with Tailwind CSS and standard inline SVG icons. Do not execute scripts or create external files.`,
	];

	if (id === "impeccable") {
		adapterHeader.push(
			`[Surface Mode Note]: Surface modes (persuade, operate, read, experience) apply to screen planning and layout density. Interactive CLI commands (/impeccable audit) do not run in Studio.`,
		);
	} else if (id === "frontend-design") {
		adapterHeader.push(
			`[Aesthetic Direction Note]: Ground typography, palette, and layout in the subject matter. Screenshot self-critique is validated via Studio's HTML contract validator.`,
		);
	} else if (id === "ui-ux-pro-max") {
		adapterHeader.push(
			`[UX Priority Note]: Priority order (Accessibility > Touch > Responsive > Typography > Feedback) is strictly enforced. Design system recommendations matched from curated datasets are injected at planning time.`,
		);
	} else if (id === "anti-slop") {
		adapterHeader.push(
			`[Purpose Filter Note]: Every element must serve hierarchy, readability, or content. Avoid decorative fluff (no nested capsules, no neon gradients, no random sparkle icons).`,
		);
	} else if (id === "taste") {
		adapterHeader.push(
			`[Scope Adapter Note]: Verbatim upstream Taste v2.1.5 guidelines. For operational screens, dashboards, settings, and mobile apps, apply the App Screen Guidelines (quiet borders, data-focused color, tabular numbers, no decorative hero or marketing photo quotas). For marketing or landing pages, apply the page art direction principles.`,
		);
	}
	adapterHeader.push(
		`================================================================================\n`,
	);

	const headerText = adapterHeader.join("\n");
	parts.push(headerText);
	currentChars += headerText.length;

	// 2. Primary SKILL.md (Always included first in full)
	let primaryText = "";
	if (id === "impeccable") primaryText = impeccableSkill;
	else if (id === "frontend-design") primaryText = frontendDesignSkill;
	else if (id === "ui-ux-pro-max") primaryText = uiUxProMaxSkill;
	else if (id === "anti-slop") primaryText = antiSlopSkill;
	else if (id === "taste") primaryText = tasteSkill;

	const primarySection = `--- PRIMARY SKILL GUIDANCE (${manifest.primaryDocument?.path}) ---\n${primaryText}\n`;
	parts.push(primarySection);
	currentChars += primarySection.length;

	// 3. Supporting reference documents (Priority order, bounded by budget)
	const refDocs: Array<{ title: string; path: string; text: string }> = [];
	if (id === "impeccable") {
		refDocs.push(
			{
				title: "Craft Floor Checklist",
				path: "craft-floor.md",
				text: impeccableCraftFloor,
			},
			{
				title: "Operational Guidelines",
				path: "operate.md",
				text: impeccableOperate,
			},
		);
	} else if (id === "ui-ux-pro-max") {
		refDocs.push(
			{
				title: "Quick Reference",
				path: "quick-reference.md",
				text: uiUxProMaxQuickRef,
			},
			{ title: "Pro Rules", path: "pro-rules.md", text: uiUxProMaxProRules },
		);
	} else if (id === "anti-slop") {
		refDocs.push(
			{ title: "Anti-Slop UI", path: "antislop-ui.md", text: antiSlopUi },
			{
				title: "Anti-Slop Layout & Mobile",
				path: "antislop-layoutmobile.md",
				text: antiSlopLayoutMobile,
			},
			{
				title: "Anti-Slop Human & Accessibility",
				path: "antislop-human.md",
				text: antiSlopHuman,
			},
		);
	} else if (id === "taste") {
		refDocs.push({
			title: "App Screen Guidelines",
			path: "app-screens.md",
			text: tasteAppScreens,
		});
	}

	for (const doc of refDocs) {
		const docSection = `\n--- REFERENCE: ${doc.title} (${doc.path}) ---\n${doc.text}\n`;
		if (
			currentChars + docSection.length <=
			STUDIO_SKILL_DOCUMENT_BUDGET_CHARS
		) {
			parts.push(docSection);
			currentChars += docSection.length;
		} else {
			omittedDocuments.push(doc.path);
		}
	}

	return {
		guidance: parts.join("\n"),
		omittedDocuments,
		characterCount: currentChars,
		manifest,
	};
}

export function getStudioSkillCapability(id: unknown): StudioSkillCapability {
	const skillId = studioDesignSkillIdSchema.parse(id);
	return CAPABILITIES[skillId];
}

export function resolveStudioDesignSkill(id: unknown) {
	const skillId = studioDesignSkillIdSchema.parse(id);
	const assembled = assembleSkillGuidance(skillId);
	return {
		id: skillId,
		version: assembled.manifest.adapterVersion,
		sourceRevision: assembled.manifest.pinnedRevision || null,
		guidance: assembled.guidance,
		omittedDocuments: assembled.omittedDocuments,
		characterCount: assembled.characterCount,
		manifest: assembled.manifest,
	};
}

export function resolveStudioSkillContext(
	id: unknown,
	options: { stage?: StudioSkillStage; focus?: string[] } = {},
) {
	const skillId = studioDesignSkillIdSchema.parse(id);
	return buildStudioSkillContext(skillId, options);
}

export function studioSkillSystemGuidance(
	id: unknown,
	options: { stage?: StudioSkillStage; focus?: string[] } = {},
): string {
	return resolveStudioSkillContext(id, options).guidance;
}

export function buildStudioSkillSystemPrompt(
	baseSystemPrompt: string,
	id: unknown,
	options: { stage?: StudioSkillStage; focus?: string[] } = {},
): string {
	const guidance = studioSkillSystemGuidance(id, options);
	return guidance ? `${baseSystemPrompt}${guidance}` : baseSystemPrompt;
}

export function resolveStudioPlanningSystemPrompt(
	id: unknown,
	promptContext?: string,
	mode: "web" | "mobile" = "web",
): string {
	const skillId = studioDesignSkillIdSchema.parse(id);
	let base = buildStudioSkillSystemPrompt(STUDIO_PLAN_SYSTEM_PROMPT, skillId, {
		stage: "planning",
		focus: promptContext ? [promptContext] : undefined,
	});

	// For UI UX Pro Max, inject bounded dataset recommendations during planning
	if (
		skillId === "ui-ux-pro-max" &&
		promptContext &&
		promptContext.trim().length > 0
	) {
		const rec = lookupUiUxProMaxDesignSystem(promptContext, mode);
		const addendum = formatUiUxProMaxPlanningAddendum(rec);
		base = `${base}\n${addendum}`;
	}

	return base;
}

export function resolveStudioFrameSystemPrompt(
	id: unknown,
	options: {
		stage?: Extract<StudioSkillStage, "frame" | "correction" | "revision">;
		focus?: string[];
	} = {},
): string {
	return buildStudioSkillSystemPrompt(
		`${STUDIO_SYSTEM_PROMPT}\n${STUDIO_BASE_QUALITY_PROMPT}`,
		id,
		{
			stage: options.stage ?? "frame",
			focus: options.focus,
		},
	);
}
