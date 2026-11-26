import { STUDIO_DESIGN_MD_MAX_CHARS } from "@/features/studio/types/studio-constants";
import type {
	StudioDesignMode,
	StudioPromptValidation,
} from "@/features/studio/types/studio-prompts";
import {
	type CanonicalDesignSystem,
	extractDesignSystemTokens,
} from "./studio-design-tokens";

export const STUDIO_MIN_PROMPT_CHARS = 10;
export const STUDIO_MAX_PROMPT_CHARS = 4000;

const DESIGN_COLOR = /^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/i;

// A DESIGN.md is data, not a briefing. Only lines that try to replace the
// caller's instructions are neutralised, so real visual rules survive.
const INSTRUCTION_OVERRIDES = [
	/\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|preceding|system|developer)\s+(?:instructions?|prompts?|rules?)/gi,
	/\b(?:system|developer|assistant)\s+(?:prompt|message|instructions?)\b/gi,
	/\byou are now\b[^\n.]{0,80}/gi,
	/\bnew\s+(?:instructions?|task)\s*:/gi,
];

// Reference fences and uppercase pseudo-roles let a document close its own
// guard; neutralising them keeps the document inside the section it was given.
const REFERENCE_FENCE_TAGS =
	/<\/?[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+[^>\n]*>|<\/?\s*(?:system|instructions?|prompt)\s*>/gi;

export function validateStudioPrompt(raw: unknown): StudioPromptValidation {
	if (typeof raw !== "string" || raw.trim().length < STUDIO_MIN_PROMPT_CHARS)
		return {
			ok: false,
			error: `Ceritakan kebutuhan UI-mu minimal ${STUDIO_MIN_PROMPT_CHARS} karakter.`,
		};
	if (raw.trim().length > STUDIO_MAX_PROMPT_CHARS)
		return {
			ok: false,
			error: `Prompt terlalu panjang (maks ${STUDIO_MAX_PROMPT_CHARS} karakter).`,
		};
	return { ok: true, prompt: raw.trim() };
}

export function validateStudioDesignMode(raw: unknown): StudioDesignMode {
	if (raw === "mobile") return "mobile";
	return "web";
}

export function sanitizeStudioDesignMd(raw: string): string {
	let clean = raw
		.replace(/\r\n/g, "\n")
		.replace(REFERENCE_FENCE_TAGS, "[removed]");
	for (const pattern of INSTRUCTION_OVERRIDES)
		clean = clean.replace(pattern, "[removed]");
	return clean.slice(0, STUDIO_DESIGN_MD_MAX_CHARS);
}

export function validateStudioDesignMd(
	raw: unknown,
): { ok: true; designMd: string | null } | { ok: false; error: string } {
	if (raw === undefined || raw === null || raw === "") {
		return { ok: true, designMd: null };
	}
	if (typeof raw !== "string") {
		return { ok: false, error: "DESIGN.md harus berupa teks string." };
	}
	const trimmed = raw.trim();
	if (trimmed.length < 20) {
		return {
			ok: false,
			error: "DESIGN.md terlalu pendek (minimal 20 karakter).",
		};
	}
	if (trimmed.length > STUDIO_DESIGN_MD_MAX_CHARS) {
		return {
			ok: false,
			error: `DESIGN.md melebihi batas ${STUDIO_DESIGN_MD_MAX_CHARS} karakter.`,
		};
	}
	// A file that is not UTF-8 reaches this server with replacement characters,
	// which would silently rewrite the palette and type scale the user paid for.
	if (trimmed.includes("\uFFFD")) {
		return { ok: false, error: "Berkas bukan teks UTF-8 yang valid." };
	}
	return { ok: true, designMd: sanitizeStudioDesignMd(trimmed) };
}

/** Colour, type or shape tokens the parser actually recognised. */
function hasUsableDesignTokens(tokens: CanonicalDesignSystem): boolean {
	return (
		Boolean(tokens.typography.fontFamily) ||
		[
			tokens.colors.primary,
			tokens.colors.canvas,
			tokens.colors.ink,
			tokens.colors.surface,
			tokens.colors.muted,
			tokens.colors.border,
		].some((value) => Boolean(value)) ||
		Object.keys(tokens.colors.accents).length > 0 ||
		Object.values(tokens.shapes.borderRadius).some((value) => Boolean(value))
	);
}

/**
 * The single preflight contract shared by every reference source and by the
 * client-side file reader: size, UTF-8, safety and parser-recognised tokens.
 */
export function inspectStudioDesignMd(
	raw: unknown,
):
	| { ok: true; designMd: string; tokens: CanonicalDesignSystem }
	| { ok: false; error: string } {
	const checked = validateStudioDesignMd(raw);
	if (!checked.ok) return checked;
	if (!checked.designMd) return { ok: false, error: "DESIGN.md diperlukan." };
	const tokens = extractDesignSystemTokens(checked.designMd);
	if (!tokens) return { ok: false, error: "DESIGN.md tidak dapat dibaca." };
	const colors: string[] = [
		tokens.colors.primary,
		tokens.colors.canvas,
		tokens.colors.ink,
		tokens.colors.surface,
		tokens.colors.muted,
		tokens.colors.border,
		...Object.values(tokens.colors.accents),
	].filter((value): value is string => typeof value === "string");
	if (colors.some((color) => !DESIGN_COLOR.test(color)))
		return { ok: false, error: "Token warna DESIGN.md tidak valid." };
	if (!hasUsableDesignTokens(tokens))
		return {
			ok: false,
			error:
				"DESIGN.md harus memuat token warna, tipografi, atau radius yang valid.",
		};
	return { ok: true, designMd: checked.designMd, tokens };
}
