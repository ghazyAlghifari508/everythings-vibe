import type { StudioDesignSkillId } from "./studio-generation-options";

// Asset identity for a skill entry. `image` points at a locally bundled,
// licensed logo; `icon` is a stable key resolved to a lucide icon in the
// selector. Keeping this typed here avoids scattering skill-specific image
// URLs through JSX and keeps the catalog serializable.
export type StudioDesignSkillAsset =
	| { kind: "image"; src: string; alt: string }
	| { kind: "icon"; icon: StudioDesignSkillIcon };

export type StudioDesignSkillIcon =
	| "none"
	| "frontend-design"
	| "ui-ux-pro-max"
	| "anti-slop";

export interface StudioDesignSkill {
	id: StudioDesignSkillId;
	label: string;
	description: string;
	asset: StudioDesignSkillAsset;
}

export const STUDIO_DESIGN_SKILLS = [
	{
		id: "none",
		label: "No Skill",
		description: "Tanpa panduan tambahan",
		asset: { kind: "icon", icon: "none" },
	},
	{
		id: "impeccable",
		label: "Impeccable",
		description: "Craft dan hierarki antarmuka",
		asset: {
			kind: "image",
			src: "/icons/skills/impeccable.svg",
			alt: "Logo Impeccable",
		},
	},
	{
		id: "frontend-design",
		label: "Frontend Design",
		description: "Arah visual sesuai konteks produk",
		asset: { kind: "icon", icon: "frontend-design" },
	},
	{
		id: "ui-ux-pro-max",
		label: "UI UX Pro Max",
		description: "Prinsip UX dan accessibility terkurasi",
		asset: { kind: "icon", icon: "ui-ux-pro-max" },
	},
	{
		id: "anti-slop",
		label: "Anti-Slop",
		description: "Filter pola desain generik",
		asset: { kind: "icon", icon: "anti-slop" },
	},
	{
		id: "taste",
		label: "Taste",
		description: "Panduan komposisi dan tipografi terkurasi",
		asset: {
			kind: "image",
			src: "/icons/skills/taste.png",
			alt: "Logo Taste",
		},
	},
] as const satisfies readonly StudioDesignSkill[];
