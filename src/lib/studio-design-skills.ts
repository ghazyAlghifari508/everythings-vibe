import type { StudioDesignSkillId } from "./studio-generation-options";

export const STUDIO_DESIGN_SKILLS = [
	{ id: "none", label: "No Skill", description: "Tanpa panduan tambahan" },
	{
		id: "impeccable",
		label: "Impeccable",
		description: "Craft dan hierarki antarmuka",
	},
	{
		id: "frontend-design",
		label: "Frontend Design",
		description: "Arah visual sesuai konteks produk",
	},
	{
		id: "ui-ux-pro-max",
		label: "UI UX Pro Max",
		description: "Prinsip UX dan accessibility terkurasi",
	},
	{
		id: "anti-slop",
		label: "Anti-Slop",
		description: "Filter pola desain generik",
	},
	{
		id: "taste",
		label: "Taste",
		description: "Panduan komposisi dan tipografi terkurasi",
	},
] as const satisfies readonly {
	id: StudioDesignSkillId;
	label: string;
	description: string;
}[];
