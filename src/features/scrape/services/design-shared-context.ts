import type { DesignTokenModel, DesignView } from "../types/design-model";

export function partitionDesignViews(views: DesignView[]): {
	shared: DesignTokenModel;
	specific: DesignView[];
} {
	const first = views[0];
	if (!first) throw new Error("A shared design requires at least one capture.");
	const shared = { ...first.model };
	const specific = views.map((view) => ({ ...view, model: { ...view.model } }));
	function partition<K extends keyof DesignTokenModel, T>(
		key: K,
		read: (model: DesignTokenModel) => T[],
		identity: (entry: T) => unknown,
	): void {
		const signature = (entry: T) => JSON.stringify(identity(entry));
		const common = read(first.model).filter((entry) =>
			views.every((view) =>
				read(view.model).some(
					(candidate) => signature(candidate) === signature(entry),
				),
			),
		);
		const keys = new Set(common.map(signature));
		Object.assign(shared, { [key]: common });
		for (const view of specific)
			Object.assign(view.model, {
				[key]: read(view.model).filter((entry) => !keys.has(signature(entry))),
			});
	}
	partition(
		"colors",
		(model) => model.colors,
		({ value, role, roleClass, token, confidence }) => ({
			value,
			role,
			roleClass,
			token,
			confidence,
		}),
	);
	partition(
		"typography",
		(model) => model.typography,
		({
			role,
			fontFamily,
			fontSize,
			fontWeight,
			lineHeight,
			letterSpacing,
			elementRoles,
		}) => ({
			role,
			fontFamily,
			fontSize,
			fontWeight,
			lineHeight,
			letterSpacing,
			elementRoles,
		}),
	);
	partition(
		"typefaces",
		(model) => model.typefaces,
		({ sample: _sample, ...entry }) => entry,
	);
	partition(
		"spacing",
		(model) => model.spacing,
		({ frequency: _frequency, ...entry }) => entry,
	);
	partition(
		"radii",
		(model) => model.radii,
		({ frequency: _frequency, scope: _scope, ...entry }) => entry,
	);
	partition(
		"elevation",
		(model) => model.elevation,
		({ value, roles, confidence }) => ({ value, roles, confidence }),
	);
	partition(
		"surfaces",
		(model) => model.surfaces,
		({ value, roles, confidence }) => ({ value, roles, confidence }),
	);
	partition(
		"observedComponents",
		(model) => model.observedComponents,
		(entry) => ({
			name: entry.name,
			roles: entry.roles,
			treatments: entry.treatments?.map(({ properties, width, height }) => ({
				properties,
				width,
				height,
			})),
		}),
	);
	shared.guidelines = { dos: [], donts: [], limitations: [] };
	shared.baseUnitPx = Number.NaN;
	return { shared, specific };
}
