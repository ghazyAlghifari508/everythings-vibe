import type { StudioDesignSkillId } from "./studio-generation-options";

export interface StudioSkillDocumentRef {
	path: string;
	title: string;
	priority: number;
	sha256: string;
	sizeBytes: number;
}

export interface StudioSkillDatasetRef {
	path: string;
	description: string;
	sha256: string;
	sizeBytes: number;
}

export interface StudioSkillManifestEntry {
	id: StudioDesignSkillId;
	name: string;
	upstreamRepo: string;
	pinnedRevision: string;
	upstreamVersion: string | null;
	adapterVersion: number;
	license: string;
	licenseFile: string;
	primaryDocument: {
		path: string;
		sha256: string;
		sizeBytes: number;
	} | null;
	referenceDocuments: StudioSkillDocumentRef[];
	datasets: StudioSkillDatasetRef[];
}

export const STUDIO_SKILL_MANIFEST: Record<
	StudioDesignSkillId,
	StudioSkillManifestEntry
> = {
	none: {
		id: "none",
		name: "No Skill",
		upstreamRepo: "",
		pinnedRevision: "",
		upstreamVersion: null,
		adapterVersion: 2,
		license: "N/A",
		licenseFile: "",
		primaryDocument: null,
		referenceDocuments: [],
		datasets: [],
	},
	impeccable: {
		id: "impeccable",
		name: "Impeccable",
		upstreamRepo: "pbakaus/impeccable",
		pinnedRevision: "245ad82def45831dc56a21b683c7a1ff530b06cc",
		upstreamVersion: "4.5.2",
		adapterVersion: 2,
		license: "Apache-2.0",
		licenseFile: "docs/studio-skills/Apache-2.0.txt",
		primaryDocument: {
			path: "src/features/studio/skills/impeccable/SKILL.md",
			sha256:
				"58c0252bca04521de87007aeb495f7ec99dc4c7341bc890fe82b6d577573af91",
			sizeBytes: 12263,
		},
		referenceDocuments: [
			{
				path: "src/features/studio/skills/impeccable/craft-floor.md",
				title: "Craft Floor Checklist",
				priority: 1,
				sha256:
					"e802e4f7bdc89050a9c0f2ca506e1d493a2316e6e810c0336c57aa073717ef3e",
				sizeBytes: 5500,
			},
			{
				path: "src/features/studio/skills/impeccable/operate.md",
				title: "Operational Screen Guidelines",
				priority: 2,
				sha256:
					"a9d2203acd45ca33a13d5c68b02b23ed512425ac15f0e8438318ed124b43729d",
				sizeBytes: 4145,
			},
		],
		datasets: [],
	},
	"frontend-design": {
		id: "frontend-design",
		name: "Frontend Design",
		upstreamRepo: "anthropics/skills",
		pinnedRevision: "dbd4588f9e1033efb41dad4bef2f7947c8993d44",
		upstreamVersion: null,
		adapterVersion: 2,
		license: "Apache-2.0",
		licenseFile: "docs/studio-skills/Apache-2.0.txt",
		primaryDocument: {
			path: "src/features/studio/skills/frontend-design/SKILL.md",
			sha256:
				"d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3",
			sizeBytes: 9390,
		},
		referenceDocuments: [],
		datasets: [],
	},
	"ui-ux-pro-max": {
		id: "ui-ux-pro-max",
		name: "UI UX Pro Max",
		upstreamRepo: "nextlevelbuilder/ui-ux-pro-max-skill",
		pinnedRevision: "7246805992a42b7bba37d4cac83b01416f0c6c44",
		upstreamVersion: null,
		adapterVersion: 2,
		license: "MIT",
		licenseFile: "docs/studio-skills/ui-ux-pro-max-LICENSE.txt",
		primaryDocument: {
			path: "src/features/studio/skills/ui-ux-pro-max/SKILL.md",
			sha256:
				"ea087c341bfb5b23195c7302027268ede86da802554c18a5c4896a6017b439f9",
			sizeBytes: 15969,
		},
		referenceDocuments: [
			{
				path: "src/features/studio/skills/ui-ux-pro-max/quick-reference.md",
				title: "Quick Reference",
				priority: 1,
				sha256:
					"0609bc7c89dacb40472465d8fc14257b56b2c43439660fc8d6fa3b8c022e1876",
				sizeBytes: 24526,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/pro-rules.md",
				title: "Pro Design Rules",
				priority: 2,
				sha256:
					"d28442d61c310b49c054a4ea736f89fb3008beebdbbc38c4b3a540b8f7fadf23",
				sizeBytes: 10909,
			},
		],
		datasets: [
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/products.csv",
				description: "194 Product types & style mappings",
				sha256:
					"42473f75e8dde5987bdf89ce55d8c168091b80a356cae691dd60247d80720b70",
				sizeBytes: 75623,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/styles.csv",
				description: "90 Style categories & CSS keywords",
				sha256:
					"a93a4d9d7025856575d7b7583bda020be9043013432c5af7c58af9dbdfb206b7",
				sizeBytes: 149478,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/colors.csv",
				description: "194 Palette presets & token definitions",
				sha256:
					"8162429222bce22df62b564085946a30d07cc9722c58d0a3a494bd0d1d00841c",
				sizeBytes: 37940,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/typography.csv",
				description: "76 Font pairing recommendations",
				sha256:
					"321fc446e89024488ebae96dda93efc4d2307bd8bddb240857ad51364f6782c8",
				sizeBytes: 49997,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/ux-guidelines.csv",
				description: "121 Core UX guidelines & code examples",
				sha256:
					"ff81ec613f70ba9fc3fcce52dbe4ae35d44b2079dbe6dc066d2d6e38c28facd5",
				sizeBytes: 27516,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/landing.csv",
				description: "36 Landing page design patterns",
				sha256:
					"9a2edd3bb676c2a58f00ade7a062e285222d4297bfd847c8d5b056f0dbbf52d0",
				sizeBytes: 25449,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/app-interface.csv",
				description: "34 Mobile & web interface guidelines",
				sha256:
					"331e7cf2c0b222d80c566c5f255c63cb339f65bfd02e471a720f28e4864a9f08",
				sizeBytes: 11046,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/charts.csv",
				description: "27 Chart selection & a11y recommendations",
				sha256:
					"4115cf1120680f2cedef0676cb648f30c7ef4699e2a947535d4113e71ed3b12a",
				sizeBytes: 23365,
			},
			{
				path: "src/features/studio/skills/ui-ux-pro-max/data/stacks/html-tailwind.csv",
				description: "61 HTML & Tailwind best practices",
				sha256:
					"d05a581d20af57b8ca0104a6d31d90a07c437d500662a96c3029fc2f9a4678ee",
				sizeBytes: 16551,
			},
		],
	},
	"anti-slop": {
		id: "anti-slop",
		name: "Anti-Slop",
		upstreamRepo: "miqdadbadjuber/anti-slop",
		pinnedRevision: "9685ca7eac70283d083fc23baa9a88e7d3cd93c4",
		upstreamVersion: null,
		adapterVersion: 2,
		license: "MIT",
		licenseFile: "docs/studio-skills/anti-slop-LICENSE.txt",
		primaryDocument: {
			path: "src/features/studio/skills/anti-slop/SKILL.md",
			sha256:
				"64a1ff70bafbfb7a105083cdff0026a6f09baf7e19d3aa1bc3e880cf7233f90c",
			sizeBytes: 57827,
		},
		referenceDocuments: [
			{
				path: "src/features/studio/skills/anti-slop/antislop-ui.md",
				title: "Anti-Slop UI & Visual",
				priority: 1,
				sha256:
					"47d9892771253f544f7eb2e40af35fd5c31407dcd8c048183bbd1de5a00a4bbe",
				sizeBytes: 26844,
			},
			{
				path: "src/features/studio/skills/anti-slop/antislop-layoutmobile.md",
				title: "Anti-Slop Layout & Mobile",
				priority: 2,
				sha256:
					"8613395a5109f637837f5c24f0ce5e58a96df1c2567a9f7666fcaecc47ff39cd",
				sizeBytes: 16378,
			},
			{
				path: "src/features/studio/skills/anti-slop/antislop-human.md",
				title: "Anti-Slop Human & Accessibility",
				priority: 3,
				sha256:
					"5bc7c8e56cc79a5154eabf32469fd9f95621ac0b0faa73acd5816d56aafd5868",
				sizeBytes: 11051,
			},
		],
		datasets: [],
	},
	taste: {
		id: "taste",
		name: "Taste",
		upstreamRepo: "Leonxlnx/taste-skill",
		pinnedRevision: "d237dd399d57524945c0c81327da5da19f7a468d",
		upstreamVersion: null,
		adapterVersion: 2,
		license: "MIT",
		licenseFile: "docs/studio-skills/taste-LICENSE.txt",
		primaryDocument: {
			path: "src/features/studio/skills/taste/SKILL.md",
			sha256:
				"2136ed83016bfada39f7b8013b2aafd9f78fcbd9799110ed222a79c6419ba5fb",
			sizeBytes: 89478,
		},
		referenceDocuments: [],
		datasets: [],
	},
};
