import type { DesignTokenModel } from "../types/design-model";

// Viewer-only capture contexts. Both the Style Inspector and the DESIGN.md panel
// read one selection, and the selection is derived from the verified capture
// model, never from requested browser preferences or from document text.

export type DesignThemeKey = "light" | "dark";

export interface DesignViewportOption {
	key: string;
	label: string;
	detail: string;
	viewIds: number[];
}

export interface DesignViewSelection {
	/** Selected measured viewport class; null keeps every capture. */
	viewport: string | null;
	/** Selected observed theme; null keeps every capture. */
	theme: DesignThemeKey | null;
}

export interface DesignCaptureScope {
	/** The exact capture heading the canonical document renders for this view. */
	label: string;
	theme: DesignThemeKey | "unknown";
	viewport: string;
}

const VIEWPORT_LABELS: Record<string, string> = {
	desktop: "Desktop",
	tablet: "Tablet",
	mobile: "Mobile",
};

const THEME_ORDER: DesignThemeKey[] = ["light", "dark"];

// A phone-width capture is never called a tablet: the class comes from the
// measured width, so 390px stays Mobile.
export function viewportKeyForWidth(width: number): string {
	if (width >= 1024) return "desktop";
	if (width >= 768) return "tablet";
	return "mobile";
}

export function designCaptureScopes(
	model: DesignTokenModel | null,
): DesignCaptureScope[] {
	return (model?.views ?? []).map((view) => ({
		label: view.label,
		theme:
			view.observedTheme === "light" || view.observedTheme === "dark"
				? view.observedTheme
				: "unknown",
		viewport: viewportKeyForWidth(view.model.viewport.width),
	}));
}

// A switcher only exists for viewports that were actually captured, and only
// when the captures disagree: one measured viewport needs no control.
export function designViewportOptions(
	model: DesignTokenModel | null,
): DesignViewportOption[] {
	const groups = new Map<
		string,
		{ option: DesignViewportOption; width: number }
	>();
	for (const view of model?.views ?? []) {
		const width = view.model.viewport.width;
		const key = viewportKeyForWidth(width);
		const existing = groups.get(key);
		if (existing) {
			existing.option.viewIds.push(view.id);
			existing.width = Math.max(existing.width, width);
			continue;
		}
		groups.set(key, {
			width,
			option: {
				key,
				label: VIEWPORT_LABELS[key] ?? key,
				detail: `${view.model.viewport.width}x${view.model.viewport.height}`,
				viewIds: [view.id],
			},
		});
	}
	if (groups.size < 2) return [];
	return [...groups.values()]
		.sort((a, b) => b.width - a.width)
		.map((entry) => entry.option);
}

// A theme is offered only when the selected viewport actually rendered both
// appearances. A requested dark preference that rendered light never becomes a
// theme option.
export function designThemeOptions(
	model: DesignTokenModel | null,
	viewport: string | null,
): DesignThemeKey[] {
	const observed = new Set<DesignThemeKey>();
	for (const view of model?.views ?? []) {
		if (viewport && viewportKeyForWidth(view.model.viewport.width) !== viewport)
			continue;
		if (view.observedTheme === "light" || view.observedTheme === "dark")
			observed.add(view.observedTheme);
	}
	const options = THEME_ORDER.filter((theme) => observed.has(theme));
	return options.length === THEME_ORDER.length ? options : [];
}

export function selectedViewIds(
	model: DesignTokenModel | null,
	selection: DesignViewSelection,
): number[] {
	const views = model?.views ?? [];
	return views
		.filter(
			(view) =>
				(!selection.viewport ||
					viewportKeyForWidth(view.model.viewport.width) ===
						selection.viewport) &&
				(!selection.theme || view.observedTheme === selection.theme),
		)
		.map((view) => view.id);
}

function scopeMatches(
	scope: DesignCaptureScope,
	selection: DesignViewSelection,
): boolean {
	if (selection.viewport && scope.viewport !== selection.viewport) return false;
	if (selection.theme && scope.theme !== selection.theme) return false;
	return true;
}

// The scoped preview keeps the canonical document intact and only drops the
// capture scopes that are outside the selected context. Capture scopes are
// matched by their exact canonical heading, so a table row or a fenced code block
// that merely mentions a capture is never touched.
export function scopedDesignMd(
	document: string,
	scopes: DesignCaptureScope[],
	selection: DesignViewSelection,
): string | undefined {
	if (!scopes.length) return undefined;
	const selected = scopes.filter((scope) => scopeMatches(scope, selection));
	if (!selected.length || selected.length === scopes.length) return undefined;
	const captureHeadings = new Set(scopes.map((scope) => `### ${scope.label}`));
	const kept = new Set(selected.map((scope) => `### ${scope.label}`));
	const lines = document.split("\n");
	const out: string[] = [];
	let inFence = false;
	let skipping = false;
	for (const line of lines) {
		if (inFence) {
			inFence = !line.trim().startsWith("```");
			if (!skipping) out.push(line);
			continue;
		}
		if (line.trim().startsWith("```")) {
			inFence = true;
			if (!skipping) out.push(line);
			continue;
		}
		const heading = line.match(/^(#{1,6})\s/);
		if (heading) {
			const level = heading[1]?.length ?? 0;
			if (level <= 3)
				skipping =
					level === 3 && captureHeadings.has(line.trim())
						? !kept.has(line.trim())
						: false;
			if (!skipping) out.push(line);
			continue;
		}
		if (!skipping) out.push(line);
	}
	const filtered = out.join("\n");
	return filtered === document ? undefined : filtered;
}
