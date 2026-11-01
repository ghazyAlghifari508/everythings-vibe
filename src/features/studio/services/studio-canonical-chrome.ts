import { isContextualScreenName } from "./studio-blueprint-navigation";
import { renderCanonicalIcon } from "./studio-canonical-icons";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

export function escapeStudioHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

/**
 * A contextual screen is a sub-screen by name (detail, edit, checkout, ...) that
 * is not itself a tab destination; it needs a back affordance. The aria-label
 * names the owning destination when the blueprint maps one, otherwise it stays
 * the generic "Kembali". A contextual-named screen the user made a real tab
 * destination gets no back button.
 */
function studioBackAriaLabel(
	blueprint: StudioDesignBlueprint,
	screen: string,
): string | null {
	if (!isContextualScreenName(screen)) return null;
	const activeId = blueprint.canonicalShell?.activeDestinations[screen];
	if (!activeId) return "Kembali";
	const index = blueprint.navigationContract.destinations.indexOf(activeId);
	const label = blueprint.navigationContract.labels[index];
	if (!label || label.toLowerCase() === screen.toLowerCase()) return null;
	return `Kembali ke ${label}`;
}

export function studioCanonicalNavigation(
	blueprint: StudioDesignBlueprint,
	screen: string,
): string {
	const contract = blueprint.navigationContract;
	const active = blueprint.canonicalShell?.activeDestinations[screen] ?? null;
	return `<nav data-studio-navigation aria-label="Navigasi utama">${contract.ordering
		.map((id) => {
			const index = contract.destinations.indexOf(id);
			return `<a href="#" data-destination="${escapeStudioHtml(id)}"${id === active ? ' aria-current="page"' : ""}>${renderCanonicalIcon(contract.iconMapping[id] ?? "circle")}<span>${escapeStudioHtml(contract.labels[index] ?? id)}</span></a>`;
		})
		.join("")}</nav>`;
}

/**
 * The app bar is platform-shaped, never one generic row. Web keeps product
 * branding in a topbar and leaves the screen title to the content header;
 * mobile shows the screen title in a compact app bar and gains a back
 * affordance on contextual screens. Consistency holds within one project, not
 * across every product.
 */
export function studioCanonicalHeader(
	blueprint: StudioDesignBlueprint,
	screen: string,
	logoUrl?: string | null,
): string {
	const shell = blueprint.canonicalShell;
	const logo = logoUrl?.trim()
		? `<img src="${escapeStudioHtml(logoUrl.trim())}" alt="Logo" width="32" height="32">`
		: "";
	if (shell?.navigation !== "bottom") {
		return `<header data-studio-header data-studio-appbar="web"><div data-studio-brand>${logo}<strong>${escapeStudioHtml(blueprint.productIdentity.productName)}</strong></div><span data-studio-user aria-hidden="true">${renderCanonicalIcon("user")}</span></header>`;
	}
	const backLabel = studioBackAriaLabel(blueprint, screen);
	const back = backLabel
		? `<a data-studio-back href="#" aria-label="${escapeStudioHtml(backLabel)}">${renderCanonicalIcon("back")}</a>`
		: "";
	// A contextual screen navigates by title; a brand mark belongs to the app's
	// own tab screens only, where there is no back affordance competing for it.
	const brand = back || !logo ? "" : `<div data-studio-brand>${logo}</div>`;
	return `<header data-studio-header data-studio-appbar="mobile">${back}<h1>${escapeStudioHtml(screen)}</h1>${brand}</header>`;
}
