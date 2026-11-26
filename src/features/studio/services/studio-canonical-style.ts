import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";
import {
	type StudioDesignBlueprint,
	studioColorContrast,
} from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

/**
 * FIX 02 — CSS ownership boundary for the canonical shell.
 *
 * The shell owns identity: design tokens, the app bar, the tab bar, the content
 * region and base box-model normalization. It does not own component geometry.
 *
 * Every non-identity declaration is emitted inside `:where(...)`, which
 * contributes zero specificity. A stylesheet rule the screen itself declares
 * (`.stepper button`, `h1`, `body`, `.card`) therefore always wins, while a
 * screen that declares nothing still receives a sane default. The previous
 * shell used `[data-studio-shell] ...` (0,1,0) selectors appended after the
 * screen's stylesheet, so it silently beat the design on gutters, control
 * padding, heading sizes and media ratios.
 */

const MOBILE_ARTBOARD_WIDTH = STUDIO_VISUAL_WIDTH.mobile;

export interface CanonicalPalette {
	primary: string;
	canvas: string;
	surface: string;
	ink: string;
	muted: string;
	border: string;
	onPrimary: string;
	font: string;
}

/** Outer gutter: density is the project's own spacing decision. */
export function canonicalGutter(blueprint: StudioDesignBlueprint): number {
	return (
		blueprint.layout?.gutter ??
		(blueprint.canonicalShell?.density === "compact" ? 16 : 24)
	);
}

/**
 * Resolves the shared palette. Explicit user colours stay authoritative over a
 * scraped DESIGN.md, and the on-primary colour is chosen for >= 4.5:1 contrast
 * instead of inheriting an unreadable one.
 */
export function canonicalPalette(
	blueprint: StudioDesignBlueprint,
	tokens: CanonicalDesignSystem | null,
): CanonicalPalette {
	const bp = blueprint.designTokens;
	const overrides = blueprint.explicitColorOverrides ?? [];
	const primary = overrides.includes("primary")
		? bp.primary
		: (tokens?.colors.primary ?? bp.primary);
	const canvas = overrides.includes("background")
		? bp.background
		: (tokens?.colors.canvas ?? bp.background);
	const surface = overrides.includes("surface")
		? bp.surface
		: (tokens?.colors.surface ?? bp.surface);
	const ink =
		(overrides.includes("ink") ? bp.ink : (tokens?.colors.ink ?? bp.ink)) ??
		"#171717";
	const muted =
		(overrides.includes("muted")
			? bp.muted
			: (tokens?.colors.muted ?? bp.muted)) ?? bp.secondary;
	const onPrimary =
		bp.onPrimary && studioColorContrast(bp.onPrimary, primary) >= 4.5
			? bp.onPrimary
			: studioColorContrast("#ffffff", primary) >=
					studioColorContrast("#000000", primary)
				? "#ffffff"
				: "#000000";
	const border =
		!overrides.includes("border") && tokens?.colors.border
			? `1px solid ${tokens.colors.border}`
			: bp.border;
	const font = tokens?.typography.fontFamily ?? bp.fontFamily;
	return { primary, canvas, surface, ink, muted, border, onPrimary, font };
}

/**
 * Ratios a media element may declare. They are deliberately different: a
 * product thumbnail is not a banner and an avatar is not a promo. A shared
 * `16/9` for every image (including any `figure img` or Unsplash URL) cropped
 * 16/10 product containers and flattened circular avatars.
 */
const MEDIA_RATIOS = [
	["banner", "16/9"],
	["promo", "21/9"],
	["product", "4/3"],
	["thumb", "4/3"],
	["avatar", "1/1"],
] as const;

function mediaRules(): string {
	const sized = MEDIA_RATIOS.map(
		([name, ratio]) =>
			`:where([data-media="${name}"]){aspect-ratio:${ratio};width:100%;object-fit:cover}`,
	);
	const filled = MEDIA_RATIOS.map(
		([name]) =>
			`:where([data-media="${name}"] > img, [data-media="${name}"] > picture > img, [data-media="${name}"] > video){width:100%;height:100%;object-fit:cover}`,
	);
	return [
		...sized,
		...filled,
		// The ratio is a fallback for a media slot, never a replacement for the
		// ratio the component already declares.
		`:where([data-media="logo"]){object-fit:contain;width:auto;height:auto;max-width:100%;max-height:100%}`,
		`:where([data-media="logo"] > img, [data-media="logo"] > svg){object-fit:contain;max-width:100%;max-height:100%}`,
		`:where([data-media="photo"]){object-fit:cover}`,
		`@supports not (aspect-ratio:16/9){:where([data-media="banner"], [data-media="promo"], [data-media="product"], [data-media="thumb"]){width:100%;min-height:200px;object-fit:cover}}`,
	].join("\n");
}

/**
 * Control rules, split by role. One shared `min-height:44px; padding:10px 14px`
 * for every button/input/select/textarea turned quantity steppers into wide
 * flat bars and stretched radio buttons; the split below keeps the touch target
 * where it matters (the screen's primary action) and leaves every other control
 * to its own component rule.
 */
function controlRules(buttonRadius: string): string {
	return [
		`:where([data-studio-shell] button, [data-studio-shell] input, [data-studio-shell] select, [data-studio-shell] textarea, [data-studio-shell] [role="button"]){font:inherit;color:inherit;max-width:100%}`,
		// Fields get a default field shape; native radio/checkbox/range keep their box.
		`:where([data-studio-shell] input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="color"]), [data-studio-shell] select, [data-studio-shell] textarea){border:var(--app-border);border-radius:${buttonRadius};background:var(--app-surface);padding:10px 14px}`,
		// A neutral button shape the design restyles; no shared dimension is imposed.
		`:where([data-studio-shell] button, [data-studio-shell] [role="button"]){border:var(--app-border);border-radius:${buttonRadius};background:var(--app-surface);padding:8px 12px}`,
		// The screen's primary action is the one control guaranteed a touch target.
		`:where([data-studio-shell] [data-primary], [data-studio-shell] button[type="submit"]){min-height:44px;padding:10px 16px;border:0;background:var(--app-primary);color:var(--app-on-primary)}`,
	].join("\n");
}

/**
 * Mobile output keeps the mobile design width and is centred when the document
 * is opened on a desktop browser. A 390px-wide app pinned to the left edge of a
 * 1440px window was the reported defect. The cap is scoped to wide viewports so
 * a 360–430px phone keeps using its available width, and it is never applied to
 * web output: a web screen is a real desktop page, not a phone mock.
 */
function platformRules(
	blueprint: StudioDesignBlueprint,
	palette: CanonicalPalette,
): string {
	if (blueprint.productIdentity.platform !== "mobile") return "";
	return `@media (min-width:${MOBILE_ARTBOARD_WIDTH + 90}px){:where(body){background:${palette.canvas}}[data-studio-shell]{width:${MOBILE_ARTBOARD_WIDTH}px;margin-inline:auto}}`;
}

export function canonicalShellStyle(
	blueprint: StudioDesignBlueprint,
	tokens: CanonicalDesignSystem | null,
): string {
	const palette = canonicalPalette(blueprint, tokens);
	const gutter = canonicalGutter(blueprint);
	const shell = blueprint.canonicalShell;
	const buttonRadius =
		tokens?.shapes.borderRadius.buttons ?? "var(--app-radius)";
	const cardRadius = tokens?.shapes.borderRadius.cards ?? "var(--app-radius)";
	const layout = blueprint.layout;
	const layoutTokens = layout
		? `--app-content-width:${layout.contentMaxWidth}px;${layout.spacing.map((value, index) => `--app-space-${index}:${value}px;`).join("")}${layout.typography.map((value, index) => `--app-type-${index}:${value}px;`).join("")}`
		: "";
	return `<style id="studio-canonical-style">
html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}
:where(body){margin:0}
[data-studio-shell]{--app-primary:${palette.primary};--app-secondary:${blueprint.designTokens.secondary};--app-on-primary:${palette.onPrimary};--app-canvas:${palette.canvas};--app-surface:${palette.surface};--app-ink:${palette.ink};--app-muted:${palette.muted};--app-border:${palette.border};--app-font:${palette.font};--app-gutter:${gutter}px;--app-radius:${blueprint.designTokens.radius}px;min-width:0;width:100%;background:var(--app-canvas);color:var(--app-ink);font-family:var(--app-font);overflow-wrap:break-word}
${layout ? `[data-studio-shell]{${layoutTokens}}:where([data-studio-content]){width:100%;max-width:var(--app-content-width);margin-inline:auto}` : ""}
${controlRules(buttonRadius)}
:where([data-studio-shell] .card, [data-studio-shell] [data-card]){border:var(--app-border);border-radius:${cardRadius};background:var(--app-surface);min-width:0}
:where([data-studio-shell] table){width:100%;border-collapse:collapse;text-align:left;font-size:14px}
:where([data-studio-shell] th){padding:10px 12px;font-weight:600;border-bottom:var(--app-border);white-space:nowrap}
:where([data-studio-shell] td){padding:10px 12px;border-bottom:var(--app-border)}
:where([data-studio-shell] [data-table-container], [data-studio-shell] .table-container, [data-studio-shell] .overflow-x-auto){overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;min-width:0}
:where([data-studio-shell] .grid, [data-studio-shell] [class*="grid-cols"]){min-width:0;max-width:100%}
:where([data-studio-shell] .grid > *, [data-studio-shell] [class*="grid-cols"] > *){min-width:0}
:where([data-studio-shell] .flex > *, [data-studio-shell] [class*="flex-"] > *){min-width:0}
:where([data-studio-shell] img, [data-studio-shell] svg, [data-studio-shell] video){max-width:100%}
:where([data-studio-shell] img, [data-studio-shell] video){height:auto}
${mediaRules()}
:where([data-studio-shell] h1){font-size:28px;line-height:1.2}
:where([data-studio-shell] h2){font-size:22px;line-height:1.3}
:where([data-studio-shell] h3){font-size:18px;line-height:1.4}
:where([data-studio-shell] input, [data-studio-shell] textarea, [data-studio-shell] select):focus-visible{outline:2px solid var(--app-primary);outline-offset:2px}
:where([data-studio-content]){min-width:0;padding:var(--app-gutter)}
[data-studio-header]{display:flex;align-items:center;gap:12px;min-width:0;padding:12px var(--app-gutter);border-bottom:var(--app-border);background:var(--app-surface)}
[data-studio-appbar="web"]{justify-content:space-between;min-height:64px;padding-top:calc(12px + env(safe-area-inset-top))}
[data-studio-brand]{display:flex;align-items:center;gap:10px;min-width:0}
[data-studio-brand] strong{font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-studio-brand] img{width:32px;height:32px;flex-shrink:0;object-fit:contain;border-radius:calc(var(--app-radius)/2)}
[data-studio-user]{display:flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;border:var(--app-border);border-radius:50%;background:var(--app-canvas);color:var(--app-muted)}
[data-studio-user] svg{width:18px;height:18px}
[data-studio-appbar="mobile"]{min-height:56px;padding-top:calc(10px + env(safe-area-inset-top))}
[data-studio-appbar="mobile"] h1{margin:0;flex:1;min-width:0;font-size:17px;line-height:1.3;font-weight:600}
[data-studio-back]{display:flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;min-height:44px;margin-left:-10px;color:var(--app-ink);text-decoration:none}
[data-studio-back] svg{width:20px;height:20px}
[data-studio-page-header]{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0;margin-bottom:16px}
[data-studio-page-header] h1{margin:0;font-size:28px;line-height:1.2}
[data-studio-navigation]{display:flex;gap:4px;padding:8px;border-top:var(--app-border);background:var(--app-surface)}
[data-studio-navigation] > [data-destination]{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:56px;padding:8px 4px;color:var(--app-muted);font-size:12px;line-height:1.3;text-align:center;text-decoration:none}
[data-studio-navigation] > [aria-current="page"]{color:var(--app-primary);font-weight:700;box-shadow:inset 0 -2px var(--app-primary)}
[data-studio-navigation] svg{width:20px;height:20px;flex-shrink:0}
${shell?.navigation === "sidebar" ? `[data-studio-shell]{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr)}[data-studio-header]{grid-column:1/-1}[data-studio-navigation]{grid-column:1;grid-row:2;flex-direction:column;justify-content:flex-start;border-top:0;border-right:var(--app-border)}[data-studio-navigation] > [data-destination]{flex:0;flex-direction:row;justify-content:flex-start;gap:12px;padding:12px;font-size:14px;text-align:left}[data-studio-content]{grid-column:2;grid-row:2}@media(max-width:640px){[data-studio-shell]{display:block}[data-studio-navigation]{flex-direction:row;flex-wrap:wrap}[data-studio-navigation] > [data-destination]{flex:1}}` : ""}
${shell?.navigation === "top" ? `[data-studio-navigation]{border-top:0;border-bottom:var(--app-border);flex-wrap:wrap}[data-studio-navigation] > [data-destination]{flex-direction:row;gap:8px;font-size:14px}` : ""}
${shell?.navigation === "bottom" ? `[data-studio-navigation]{padding-bottom:max(8px,env(safe-area-inset-bottom))}` : ""}
${platformRules(blueprint, palette)}
</style>`;
}
