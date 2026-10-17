export { TemplateCatalog } from "./components/template-catalog";
export {
	CODEBASE_FEATURE_TEMPLATES,
	TEMPLATE_GALLERY,
} from "./data/gallery-templates";
export { VIBE_TEMPLATES } from "./data/vibe-templates";
export {
	getTemplatesByCategory,
	searchTemplates,
} from "./services/template-service";
export type {
	CatalogEntry,
	CodebaseFeatureTemplate,
	TemplateCategory,
	TemplateEntry,
	VibeTemplateEntry,
} from "./types";
