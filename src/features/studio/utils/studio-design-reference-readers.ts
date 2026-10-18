import { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import { validateStudioDesignMd } from "@/features/studio/services/studio-prompt-validation";
import type { AttachedLogo } from "@/features/studio/types/studio";
import { STUDIO_LOGO_MAX_BYTES } from "@/features/studio/types/studio-constants";
import { formatStudioBytes } from "@/features/studio/utils/format-studio-bytes";

/** Counts the design tokens a custom DESIGN.md actually declares. */
function countDeclaredTokens(tokens: {
	colors: {
		primary?: string | null;
		canvas?: string | null;
		ink?: string | null;
		surface?: string | null;
		muted?: string | null;
		border?: string | null;
		accents: Record<string, string>;
	};
}): number {
	return (
		[
			tokens.colors.primary,
			tokens.colors.canvas,
			tokens.colors.ink,
			tokens.colors.surface,
			tokens.colors.muted,
			tokens.colors.border,
		].filter(Boolean).length + Object.keys(tokens.colors.accents).length
	);
}

export interface StudioDesignMdReadResult {
	designMd: string;
	filename: string;
	colorCount: number;
	fontFamily: string | null;
}

export interface StudioDesignMdReadFailure {
	error: string;
}

export type StudioDesignMdReadOutcome =
	| StudioDesignMdReadResult
	| StudioDesignMdReadFailure;

/**
 * Validates an uploaded DESIGN.md and reports the tokens it declares.
 *
 * A file that parses but carries no recognised colour or font token is
 * rejected, because such a reference cannot steer generation.
 */
export async function readStudioDesignMdFile(
	file: File,
): Promise<StudioDesignMdReadOutcome> {
	if (!/\.(md|markdown)$/i.test(file.name)) {
		return { error: "Gunakan file berekstensi .md atau .markdown." };
	}
	if (file.size > 500 * 1024) {
		return { error: "Ukuran file .md melebihi batas 500 KB." };
	}
	let text: string;
	try {
		text = await file.text();
	} catch {
		return { error: "Gagal membaca file. Coba lagi." };
	}
	const checked = validateStudioDesignMd(text);
	if (!checked.ok || !checked.designMd) {
		return {
			error: !checked.ok
				? checked.error
				: "File tidak berisi desain yang valid.",
		};
	}
	const tokens = extractDesignSystemTokens(checked.designMd);
	if (
		!tokens ||
		(!tokens.typography.fontFamily && countDeclaredTokens(tokens) === 0)
	) {
		return {
			error: "File tidak memuat token desain yang dikenali (warna atau font).",
		};
	}
	return {
		designMd: checked.designMd,
		filename: file.name,
		colorCount: countDeclaredTokens(tokens),
		fontFamily: tokens.typography.fontFamily ?? null,
	};
}

export interface StudioLogoReadOutcome {
	logo: AttachedLogo;
}

export interface StudioLogoReadFailure {
	error: string;
}

/** Reads a logo file into the base64 payload the Studio reference carries. */
export function readStudioLogoFile(
	file: File,
): Promise<StudioLogoReadOutcome | StudioLogoReadFailure> {
	return new Promise((resolve) => {
		if (!/^image\//.test(file.type || "")) {
			resolve({ error: "Logo harus berupa file gambar." });
			return;
		}
		if (file.size > STUDIO_LOGO_MAX_BYTES) {
			resolve({
				error: `Ukuran logo melebihi batas ${formatStudioBytes(STUDIO_LOGO_MAX_BYTES)}.`,
			});
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const url = typeof reader.result === "string" ? reader.result : "";
			const data = url.includes(",") ? url.split(",").slice(1).join(",") : "";
			if (!data) {
				resolve({ error: "Gagal membaca logo. Coba file lain." });
				return;
			}
			resolve({
				logo: {
					filename: file.name,
					mimeType: file.type || "image/png",
					data,
					byteLength: file.size,
				},
			});
		};
		reader.onerror = () => resolve({ error: "Gagal membaca logo. Coba lagi." });
		reader.readAsDataURL(file);
	});
}
