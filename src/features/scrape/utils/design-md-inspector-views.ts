import { partitionDesignViews } from "../services/design-shared-context";
import type { DesignTokenModel, DesignView } from "../types/design-model";
import type {
	DesignInspectorModel,
	InspectorComponent,
	InspectorComponentCharacteristic,
	InspectorComponentVariant,
	InspectorVerification,
} from "./design-md-inspector";

export interface InspectorViewScope {
	/** The capture scopes to show. Absent or empty shows every measured capture. */
	viewIds?: number[];
}

// A value measured in four captures is one token with four capture scopes, never
// four copies of the same token. Frequencies stay per-capture measurements and
// are never pooled; only the capture count is aggregated.
function mergeByKey<T>(
	sources: { items: T[]; viewIds: number[] }[],
	key: (item: T) => string,
): { entry: T; captures: number }[] {
	const merged = new Map<string, { entry: T; viewIds: Set<number> }>();
	for (const source of sources)
		for (const item of source.items) {
			const itemKey = key(item);
			const existing = merged.get(itemKey);
			if (existing) {
				for (const id of source.viewIds) existing.viewIds.add(id);
				continue;
			}
			merged.set(itemKey, { entry: item, viewIds: new Set(source.viewIds) });
		}
	return [...merged.values()].map(({ entry, viewIds }) => ({
		entry,
		captures: viewIds.size,
	}));
}

// A capture scope is named by what it measured, never by the requested browser
// preference: "390x844 light" is short enough to sit inside a label.
function shortScopeLabel(view: DesignView): string {
	const { width, height } = view.model.viewport;
	return view.observedTheme === "light" || view.observedTheme === "dark"
		? `${width}x${height} ${view.observedTheme}`
		: `${width}x${height}`;
}

// The same component measured in several captures is one component. What every
// capture measured identically is declared once; a value that really differs
// stays separate and keeps the capture that produced it.
function mergeComponents(
	sources: { items: InspectorComponent[]; viewIds: number[] }[],
	scopeLabels: Map<number, string>,
): InspectorComponent[] {
	const merged = new Map<
		string,
		{
			entry: InspectorComponent;
			viewIds: Set<number>;
			measured: {
				viewId: number;
				characteristics: InspectorComponentCharacteristic[];
				treatments: InspectorComponentVariant[];
			}[];
		}
	>();
	for (const source of sources)
		for (const component of source.items) {
			const existing = merged.get(component.name) ?? {
				entry: component,
				viewIds: new Set<number>(),
				measured: [],
			};
			merged.set(component.name, existing);
			for (const id of source.viewIds) existing.viewIds.add(id);
			existing.measured.push({
				viewId: source.viewIds[0] ?? 0,
				characteristics: component.sharedCharacteristics,
				treatments: component.variants,
			});
		}

	return [...merged.values()].map(({ entry, viewIds, measured }) => {
		// A characteristic is shared only when every capture measured the same
		// value for it.
		const labels = new Set<string>();
		for (const declaration of measured)
			for (const characteristic of declaration.characteristics)
				labels.add(characteristic.label);
		const common: InspectorComponentCharacteristic[] = [];
		for (const label of labels) {
			const values = measured.map((declaration) =>
				declaration.characteristics.find(
					(characteristic) => characteristic.label === label,
				),
			);
			const first = values[0];
			if (
				first &&
				values.every((value) => value && value.value === first.value)
			)
				common.push({ label, value: first.value });
		}
		const commonValues = new Map(
			common.map((characteristic) => [
				characteristic.label,
				characteristic.value,
			]),
		);

		// Variants are grouped by their label and their measured values: the same
		// treatment measured identically in three captures is one variant with
		// three samples, while a treatment whose values differ keeps one entry per
		// measured difference, named by the capture that produced it.
		const byLabel = new Map<
			string,
			Map<
				string,
				{
					samples: number;
					characteristics: InspectorComponentCharacteristic[];
					scopes: string[];
				}
			>
		>();
		for (const declaration of measured) {
			const differing = declaration.characteristics.filter(
				(characteristic) =>
					commonValues.get(characteristic.label) !== characteristic.value,
			);
			const scope =
				scopeLabels.get(declaration.viewId) ?? `capture ${declaration.viewId}`;
			const treatments = declaration.treatments.length
				? declaration.treatments
				: [{ label: "Measured style", samples: 1, characteristics: [] }];
			for (const treatment of treatments) {
				const known = new Map(
					treatment.characteristics.map((characteristic) => [
						characteristic.label,
						characteristic.value,
					]),
				);
				for (const characteristic of differing)
					if (!known.has(characteristic.label))
						known.set(characteristic.label, characteristic.value);
				const characteristics = [...known].map(([label, value]) => ({
					label,
					value,
				}));
				const signature = JSON.stringify(
					[...characteristics]
						.map((characteristic) => [
							characteristic.label,
							characteristic.value,
						])
						.sort(([a], [b]) => String(a).localeCompare(String(b))),
				);
				const buckets = byLabel.get(treatment.label) ?? new Map();
				byLabel.set(treatment.label, buckets);
				const bucket = buckets.get(signature) ?? {
					samples: 0,
					characteristics,
					scopes: [],
				};
				bucket.samples += treatment.samples;
				if (!bucket.scopes.includes(scope)) bucket.scopes.push(scope);
				buckets.set(signature, bucket);
			}
		}
		const variants: InspectorComponentVariant[] = [];
		for (const [label, buckets] of byLabel)
			for (const bucket of buckets.values())
				variants.push({
					label:
						buckets.size === 1
							? label
							: `${label} (${bucket.scopes.join(", ")})`,
					samples: bucket.samples,
					characteristics: bucket.characteristics,
				});
		return {
			...entry,
			captures: viewIds.size,
			sharedCharacteristics: common,
			variants,
		};
	});
}

export function inspectorFromViews(
	model: DesignTokenModel,
	verification: InspectorVerification,
	convert: (
		model: DesignTokenModel,
		verification: InspectorVerification,
	) => DesignInspectorModel,
	scope?: InspectorViewScope,
): DesignInspectorModel | undefined {
	const views = model.views ?? [];
	const first = views[0];
	if (!first) return undefined;
	const allViewIds = views.map((view) => view.id);
	// Shared facts are computed against every capture, so a value that all
	// captures measured stays declared once while a context view only adds its
	// own differences.
	const { shared, specific } = partitionDesignViews(views);
	const requested = scope?.viewIds?.length ? new Set(scope.viewIds) : undefined;
	const selected = requested
		? specific.filter((view) => requested.has(view.id))
		: specific;
	const base = convert(shared, verification);
	const scoped = selected.map((view) => ({
		viewIds: [view.id],
		model: convert(view.model, verification),
	}));
	const sources = <T>(
		read: (source: DesignInspectorModel) => T[],
	): { items: T[]; viewIds: number[] }[] => [
		{ items: read(base), viewIds: allViewIds },
		...scoped.map((entry) => ({
			items: read(entry.model),
			viewIds: entry.viewIds,
		})),
	];

	return {
		...base,
		title: model.title,
		theme: model.theme,
		colors: mergeByKey(
			sources((source) => source.colors),
			(color) =>
				[
					color.value,
					color.role,
					color.roleClass,
					color.token,
					color.confidence,
				].join("|"),
		).map(({ entry, captures }) => ({ ...entry, captures })),
		typography: mergeByKey(
			sources((source) => source.typography),
			(entry) =>
				[
					entry.role,
					entry.family,
					entry.size,
					entry.weight,
					entry.lineHeight,
					entry.letterSpacing,
				].join("|"),
		).map(({ entry }) => entry),
		typefaces: mergeByKey(
			sources((source) => source.typefaces),
			(typeface) => [typeface.family, typeface.stack].join("|"),
		).map(({ entry }) => entry),
		spacing: mergeByKey(
			sources((source) => source.spacing),
			(token) => [token.label, token.value].join("|"),
		).map(({ entry }) => entry),
		radii: mergeByKey(
			sources((source) => source.radii),
			(token) => [token.label, token.value, token.pill].join("|"),
		).map(({ entry }) => entry),
		elevation: mergeByKey(
			sources((source) => source.elevation),
			(token) => [token.value, token.roles.join(",")].join("|"),
		).map(({ entry }) => entry),
		surfaces: mergeByKey(
			sources((source) => source.surfaces),
			(surface) => surface.value,
		).map(({ entry }) => entry),
		components: mergeComponents(
			sources((source) => source.components),
			new Map(views.map((view) => [view.id, shortScopeLabel(view)])),
		),
		dos: mergeByKey(
			sources((source) => source.dos),
			(rule) => [rule.rule, rule.evidence].join("|"),
		).map(({ entry }) => entry),
		donts: mergeByKey(
			sources((source) => source.donts),
			(rule) => [rule.rule, rule.evidence].join("|"),
		).map(({ entry }) => entry),
		limitations: [
			...new Set([
				...base.limitations,
				...scoped.flatMap(({ model: scopedModel }) => scopedModel.limitations),
			]),
		],
	};
}
