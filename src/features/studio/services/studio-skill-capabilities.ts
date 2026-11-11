import {
	type StudioDesignSkillId,
	studioDesignSkillIdSchema,
} from "./studio-generation-options";
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
export function getStudioSkillCapability(id: unknown): StudioSkillCapability {
	const skillId = studioDesignSkillIdSchema.parse(id);
	return CAPABILITIES[skillId];
}
