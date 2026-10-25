import type { DesignTokenModel } from "../services/design-model";
import type {
	DesignInspectorModel,
	InspectorVerification,
} from "./design-md-inspector";

export function inspectorFromViews(
	model: DesignTokenModel,
	verification: InspectorVerification,
	convert: (
		model: DesignTokenModel,
		verification: InspectorVerification,
	) => DesignInspectorModel,
): DesignInspectorModel | undefined {
	const views = (model.views ?? []).map((view) => ({
		label: view.label,
		model: convert(view.model, verification),
	}));
	const first = views[0]?.model;
	if (!first) return undefined;
	return {
		...first,
		title: model.title,
		theme: model.theme,
		colors: views.flatMap(({ label, model: scoped }) =>
			scoped.colors.map((token) => ({
				...token,
				name: `${token.name} (${label})`,
				role: `${token.role} (${label})`,
			})),
		),
		typography: views.flatMap(({ label, model: scoped }) =>
			scoped.typography.map((entry) => ({
				...entry,
				role: `${entry.role} (${label})`,
			})),
		),
		typefaces: views.flatMap(({ label, model: scoped }) =>
			scoped.typefaces.map((entry) => ({
				...entry,
				roles: entry.roles.map((role) => `${role} (${label})`),
			})),
		),
		spacing: views.flatMap(({ label, model: scoped }) =>
			scoped.spacing.map((token) => ({
				...token,
				context: `${token.context}; ${label}`,
			})),
		),
		radii: views.flatMap(({ label, model: scoped }) =>
			scoped.radii.map((token) => ({
				...token,
				context: `${token.context}; ${label}`,
			})),
		),
		elevation: views.flatMap(({ label, model: scoped }) =>
			scoped.elevation.map((token) => ({
				...token,
				usageNote: `${token.usageNote} ${label}`,
			})),
		),
		surfaces: views.flatMap(({ label, model: scoped }) =>
			scoped.surfaces.map((token) => ({
				...token,
				roles: token.roles.map((role) => `${role} (${label})`),
			})),
		),
		components: views.flatMap(({ label, model: scoped }) =>
			scoped.components.map((entry) => ({
				...entry,
				name: `${entry.name} (${label})`,
			})),
		),
		dos: views.flatMap(({ label, model: scoped }) =>
			scoped.dos.map((entry) => ({
				...entry,
				evidence: `${entry.evidence} ${label}`,
			})),
		),
		donts: views.flatMap(({ label, model: scoped }) =>
			scoped.donts.map((entry) => ({
				...entry,
				evidence: `${entry.evidence} ${label}`,
			})),
		),
		limitations: [
			...new Set(views.flatMap(({ model: scoped }) => scoped.limitations)),
		],
	};
}
