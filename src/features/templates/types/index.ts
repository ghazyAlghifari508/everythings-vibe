export type TemplateCategory = "planning" | "design" | "boilerplate";

export interface CatalogEntry {
	readonly id: string;
	readonly title: string;
	readonly prompt: string;
}

export interface TemplateEntry extends CatalogEntry {
	readonly icon: string;
	readonly platform: "web" | "mobile";
}

export interface CodebaseFeatureTemplate {
	readonly id: string;
	readonly title: string;
	readonly category: string;
	readonly prompt: string;
}

export interface VibeTemplateEntry {
	readonly id: string;
	readonly title: string;
	readonly category: TemplateCategory;
	readonly icon: string;
	readonly platform: "web" | "mobile";
	readonly description: string;
	readonly prompt: string;
	readonly tags: readonly string[];
	readonly recommendedTarget: "/plan/new" | "/design";
	readonly techStack?: readonly string[];
}
