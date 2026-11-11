import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";
import { canonicalNavigationStyle } from "./studio-canonical-navigation-style";
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
		`:where([data-media-fit="contain"], [data-media-fit="contain"] > img, [data-media-fit="contain"] > picture > img){object-fit:contain}`,
		`:where([data-media-fit="cover"], [data-media-fit="cover"] > img, [data-media-fit="cover"] > picture > img){object-fit:cover}`,
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
	const buttonRadius =
		tokens?.shapes.borderRadius.buttons ?? "var(--app-radius)";
	const cardRadius = tokens?.shapes.borderRadius.cards ?? "var(--app-radius)";
	const layout = blueprint.layout;
	const contentWidth =
		blueprint.productIdentity.platform === "mobile"
			? MOBILE_ARTBOARD_WIDTH
			: Math.max(768, layout?.contentMaxWidth ?? STUDIO_VISUAL_WIDTH.web);
	const layoutTokens = `--app-content-width:${contentWidth}px;${(layout?.spacing ?? [4, 8, 16, 24, 32]).map((value, index) => `--app-space-${index}:${value}px;`).join("")}${(layout?.typography ?? [14, 16, 22, 28]).map((value, index) => `--app-type-${index}:${value}px;`).join("")}`;
	return `<style id="studio-canonical-style">
html{box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}
:where(body){margin:0}
[data-studio-shell]{--app-primary:${palette.primary};--app-secondary:${blueprint.designTokens.secondary};--app-on-primary:${palette.onPrimary};--app-canvas:${palette.canvas};--app-surface:${palette.surface};--app-ink:${palette.ink};--app-muted:${palette.muted};--app-border:${palette.border};--app-font:${palette.font};--app-gutter:${gutter}px;--app-radius:${blueprint.designTokens.radius}px;min-width:0;width:100%;background:var(--app-canvas);color:var(--app-ink);font-family:var(--app-font);overflow-wrap:break-word}
[data-studio-shell]{${layoutTokens}}:where([data-studio-content]){width:100%;max-width:var(--app-content-width);margin-inline:auto}
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
${canonicalNavigationStyle(blueprint)}
${platformRules(blueprint, palette)}
</style>`;
}
