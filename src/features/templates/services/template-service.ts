import { VIBE_TEMPLATES } from "../data/vibe-templates";
import type { TemplateCategory, VibeTemplateEntry } from "../types";

export function getTemplatesByCategory(
	category: TemplateCategory,
): readonly VibeTemplateEntry[] {
	return VIBE_TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(
	query: string,
	category?: TemplateCategory | "all",
): readonly VibeTemplateEntry[] {
	const q = query.trim().toLowerCase();
	return VIBE_TEMPLATES.filter((t) => {
		if (category && category !== "all" && t.category !== category) return false;
		if (!q) return true;
		return (
			t.title.toLowerCase().includes(q) ||
			t.description.toLowerCase().includes(q) ||
			t.prompt.toLowerCase().includes(q) ||
			t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
			(t.techStack?.some((tech) => tech.toLowerCase().includes(q)) ?? false)
		);
	});
}
