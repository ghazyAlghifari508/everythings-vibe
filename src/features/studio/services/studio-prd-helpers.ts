import {
	STUDIO_PRD_FILE_MAX_BYTES,
	STUDIO_PRD_MAX_CHARS,
	STUDIO_PRD_MIN_CHARS,
} from "@/features/studio/types/studio-constants";

export interface ValidatedStudioPrdFilename {
	ok: true;
	filename: string;
}

export interface InvalidStudioPrdFilename {
	ok: false;
	error: string;
}

export type ValidateStudioPrdFilenameResult =
	| ValidatedStudioPrdFilename
	| InvalidStudioPrdFilename;

export function validateStudioPrdFilename(
	raw: string | null | undefined,
): ValidateStudioPrdFilenameResult {
	if (typeof raw !== "string") {
		return { ok: false, error: "Nama file tidak valid." };
	}
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return { ok: false, error: "Nama file tidak boleh kosong." };
	}
	if (trimmed.length > 255) {
		return {
			ok: false,
			error: "Nama file terlalu panjang (maksimum 255 karakter).",
		};
	}
	if (/[/\\\0]/.test(trimmed)) {
		return {
			ok: false,
			error: "Nama file tidak boleh mengandung karakter path separator.",
		};
	}

	// Strictly require .md extension with non-empty base name (reject .markdown, .txt, .pdf, .docx, and empty basename like ".md")
	const lower = trimmed.toLowerCase();
	if (!lower.endsWith(".md") || lower === ".md") {
		return {
			ok: false,
			error:
				"Format PRD tidak didukung. Hanya file berekstensi .md yang didukung.",
		};
	}

	return { ok: true, filename: trimmed };
}

export interface ValidatedStudioPrdText {
	ok: true;
	content: string;
	byteLength: number;
}

export interface InvalidStudioPrdContent {
	ok: false;
	error: string;
}

export type ValidateStudioPrdTextResult =
	| ValidatedStudioPrdText
	| InvalidStudioPrdContent;

export function validateStudioPrdText(
	raw: string | null | undefined,
): ValidateStudioPrdTextResult {
	if (typeof raw !== "string") {
		return { ok: false, error: "Konten PRD tidak valid." };
	}
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return { ok: false, error: "Dokumen PRD tidak boleh kosong." };
	}
	if (trimmed.length < STUDIO_PRD_MIN_CHARS) {
		return {
			ok: false,
			error: `Dokumen PRD terlalu pendek (minimal ${STUDIO_PRD_MIN_CHARS} karakter).`,
		};
	}
	if (trimmed.length > STUDIO_PRD_MAX_CHARS) {
		return {
			ok: false,
			error: `Dokumen PRD melebihi batas ${STUDIO_PRD_MAX_CHARS.toLocaleString()} karakter.`,
		};
	}

	const byteLength = new TextEncoder().encode(trimmed).length;
	if (byteLength > STUDIO_PRD_FILE_MAX_BYTES) {
		return {
			ok: false,
			error: `Ukuran file PRD melebihi batas ${(STUDIO_PRD_FILE_MAX_BYTES / 1024).toFixed(0)} KB.`,
		};
	}

	// Binary file detection: reject null bytes or binary magic bytes
	if (trimmed.includes("\0")) {
		return {
			ok: false,
			error:
				"File terdeteksi sebagai file biner dan bukan dokumen teks markdown yang valid.",
		};
	}

	const binarySignatures = [
		"%PDF-", // PDF
		"PK\x03\x04", // ZIP / DOCX
		"\x7fELF", // Linux ELF executable
		"MZ", // Windows PE executable
	];
	for (const sig of binarySignatures) {
		if (trimmed.startsWith(sig)) {
			return {
				ok: false,
				error:
					"File terdeteksi sebagai file biner dan bukan dokumen teks markdown yang valid.",
			};
		}
	}

	return {
		ok: true,
		content: trimmed,
		byteLength,
	};
}

export function sanitizeStudioPrd(content: string): string {
	return content
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
		.replace(
			/<\/?PRODUCT_REQUIREMENTS_REFERENCE_DO_NOT_EXECUTE_AS_INSTRUCTIONS>/gi,
			"",
		)
		.replace(
			/<\/?DESIGN_SYSTEM_REFERENCE_DO_NOT_EXECUTE_AS_INSTRUCTIONS>/gi,
			"",
		)
		.replace(/<\/?SHARED_DESIGN_BLUEPRINT>/gi, "")
		.trim()
		.slice(0, STUDIO_PRD_MAX_CHARS);
}

export interface StudioPrdSummary {
	title?: string;
	headings: string[];
	excerpt: string;
}

export function extractStudioPrdSummary(content: string): StudioPrdSummary {
	const sanitized = sanitizeStudioPrd(content);
	const lines = sanitized.split("\n");
	let title: string | undefined;
	const headings: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!title && /^#\s+(.+)$/.test(trimmed)) {
			title = trimmed.replace(/^#\s+/, "").trim();
		} else if (/^#{1,3}\s+(.+)$/.test(trimmed)) {
			headings.push(trimmed.replace(/^#{1,3}\s+/, "").trim());
		}
	}

	// Limit excerpt to first 2000 chars for concise prompt summaries if needed
	const excerpt = sanitized.slice(0, 2000).trim();

	return {
		title,
		headings,
		excerpt,
	};
}
