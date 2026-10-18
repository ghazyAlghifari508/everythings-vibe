import {
	STUDIO_LOGO_ALLOWED_MIMES,
	STUDIO_LOGO_MAX_BYTES,
} from "@/features/studio/types/studio-constants";
import { ScrapeError } from "@/lib/design-errors";
import type { StudioLogoInput } from "../types/studio-service";
import { issueStudioAssetCapability } from "./studio-asset-capability";

export function sanitizeSvg(svgContent: string): string {
	return svgContent
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
		.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"')
		.replace(
			/xlink:href\s*=\s*["']\s*javascript:[^"']*["']/gi,
			'xlink:href="#"',
		);
}

export function validateAndProcessLogo(logo: StudioLogoInput): {
	mimeType: string;
	byteLength: number;
	data: string;
	filename: string;
} {
	const filename = logo.filename.trim();
	if (
		filename.toLowerCase().endsWith(".fig") ||
		/\.(exe|sh|bat|cmd|bin|dll)$/i.test(filename)
	) {
		throw new ScrapeError(
			"INVALID_URL",
			"Format file .fig atau biner tidak didukung. Gunakan PNG, JPEG, WebP, atau SVG.",
		);
	}

	const mime = logo.mimeType.toLowerCase();
	if (
		!STUDIO_LOGO_ALLOWED_MIMES.includes(
			mime as (typeof STUDIO_LOGO_ALLOWED_MIMES)[number],
		)
	) {
		throw new ScrapeError(
			"INVALID_URL",
			"Tipe file tidak didukung. Gunakan PNG, JPEG, WebP, atau SVG.",
		);
	}

	const buf = Buffer.from(logo.data, "base64");
	if (buf.byteLength === 0) {
		throw new ScrapeError("INVALID_URL", "File logo kosong.");
	}
	if (buf.byteLength > STUDIO_LOGO_MAX_BYTES) {
		throw new ScrapeError(
			"INVALID_URL",
			"Ukuran logo melebihi batas 2MB. Unggah logo yang lebih kecil.",
		);
	}

	let finalData = logo.data;
	let finalByteLength = buf.byteLength;

	if (mime === "image/svg+xml") {
		const rawSvg = buf.toString("utf8");
		if (!/<svg\b[^>]*>/i.test(rawSvg)) {
			throw new ScrapeError("INVALID_URL", "Format file SVG tidak valid.");
		}
		const cleanSvg = sanitizeSvg(rawSvg);
		const cleanBuf = Buffer.from(cleanSvg, "utf8");
		finalData = cleanBuf.toString("base64");
		finalByteLength = cleanBuf.byteLength;
	} else if (mime === "image/png") {
		if (
			buf.byteLength < 4 ||
			buf[0] !== 0x89 ||
			buf[1] !== 0x50 ||
			buf[2] !== 0x4e ||
			buf[3] !== 0x47
		) {
			throw new ScrapeError("INVALID_URL", "File bukan gambar PNG valid.");
		}
	} else if (mime === "image/jpeg") {
		if (buf.byteLength < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) {
			throw new ScrapeError("INVALID_URL", "File bukan gambar JPEG valid.");
		}
	} else if (mime === "image/webp") {
		const riff = buf.toString("ascii", 0, 4);
		const webp = buf.toString("ascii", 8, 12);
		if (riff !== "RIFF" || webp !== "WEBP") {
			throw new ScrapeError("INVALID_URL", "File bukan gambar WebP valid.");
		}
	}

	return {
		filename: filename.slice(0, 200) || "logo",
		mimeType: mime,
		byteLength: finalByteLength,
		data: finalData,
	};
}

export function buildStudioAssetUrl(assetId: string, userId: string): string {
	const cap = issueStudioAssetCapability({ assetId, ownerId: userId });
	return `/api/studio/asset?id=${encodeURIComponent(assetId)}&cap=${encodeURIComponent(cap)}`;
}
