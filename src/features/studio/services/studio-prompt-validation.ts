import { STUDIO_DESIGN_MD_MAX_CHARS } from "@/features/studio/types/studio-constants";
import type {
	StudioDesignMode,
	StudioPromptValidation,
} from "@/features/studio/types/studio-prompts";

export const STUDIO_MIN_PROMPT_CHARS = 10;
export const STUDIO_MAX_PROMPT_CHARS = 4000;

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
	return raw
		.replace(/\r\n/g, "\n")
		.replace(
			/ignore (all )?(previous|system|developer) instructions?/gi,
			"[removed]",
		)
		.replace(/system prompt/gi, "[removed]")
		.slice(0, STUDIO_DESIGN_MD_MAX_CHARS);
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
	return { ok: true, designMd: sanitizeStudioDesignMd(trimmed) };
}
