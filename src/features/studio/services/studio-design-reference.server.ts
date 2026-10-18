import { createHash } from "node:crypto";
import { getScrapeDesignMd } from "@/features/scrape/services/scrape-design-md-service";
import { ScrapeError } from "@/lib/design-errors";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import {
	STUDIO_DESIGN_FILE_MAX_BYTES,
	type StudioDesignReference,
	type StudioDesignReferenceMetadata,
	studioDesignReferenceSchema,
} from "./studio-generation-options";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "./studio-presets";
import { validateStudioDesignMd } from "./studio-prompt-validation";

const DESIGN_COLOR = /^#(?:[a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/i;

// Every source — a curated preset, an uploaded file, or a stored VibeScrape
// document — passes the same token gate so no reference can smuggle a DESIGN.md
// the design-system enforcer cannot read.
function assertUsableDesignMdTokens(designMd: string): void {
	const tokens = extractDesignSystemTokens(designMd);
	const colors = tokens
		? [
				...Object.values(tokens.colors).filter(
					(value): value is string => typeof value === "string",
				),
				...Object.values(tokens.colors.accents),
			]
		: [];
	if (colors.some((color) => !DESIGN_COLOR.test(color)))
		throw new ScrapeError("INVALID_URL", "Token warna DESIGN.md tidak valid.");
	if (
		!tokens ||
		(!tokens.typography.fontFamily &&
			!Object.values(tokens.colors).some(
				(value) => typeof value === "string" && value.length > 0,
			) &&
			!Object.keys(tokens.colors.accents).length)
	)
		throw new ScrapeError(
			"INVALID_URL",
			"DESIGN.md harus memuat token warna atau tipografi yang valid.",
		);
}

function assertDesignMdWithinBudget(raw: string | null | undefined): string {
	const checked = validateStudioDesignMd(raw);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	if (!checked.designMd)
		throw new ScrapeError("INVALID_URL", "DESIGN.md diperlukan.");
	if (Buffer.byteLength(raw ?? "", "utf8") > STUDIO_DESIGN_FILE_MAX_BYTES)
		throw new ScrapeError("INVALID_URL", "Ukuran file desain melebihi batas.");
	assertUsableDesignMdTokens(checked.designMd);
	return checked.designMd;
}

export async function resolveStudioDesignReference(
	reference: StudioDesignReference | null | undefined,
	raw: string | null | undefined,
	userId: string,
): Promise<{
	designMd: string | null;
	designReference: StudioDesignReferenceMetadata | null;
}> {
	if (reference === null) return { designMd: null, designReference: null };
	if (reference?.kind === "theme") {
		const parsed = studioDesignReferenceSchema.parse(reference);
		if (parsed.kind !== "theme") throw new ScrapeError("INVALID_URL");
		const preset = STUDIO_DESIGN_PRESETS.find((item) => item.id === parsed.id);
		const designMd = getStudioPresetDesignMd(parsed.id);
		if (!preset || !designMd)
			throw new ScrapeError("INVALID_URL", "Tema desain tidak tersedia.");
		return {
			designMd,
			designReference: {
				kind: "theme",
				id: preset.id,
				source: "studio-presets",
				version: preset.version,
			},
		};
	}
	// A scrape reference carries no document in the request: the persisted
	// DESIGN.md is read back under the caller's ownership.
	if (reference?.kind === "scrape") {
		const parsed = studioDesignReferenceSchema.parse(reference);
		if (parsed.kind !== "scrape") throw new ScrapeError("INVALID_URL");
		const source = await getScrapeDesignMd(parsed.id, userId);
		const designMd = assertDesignMdWithinBudget(source.designMd);
		return {
			designMd,
			designReference: {
				kind: "scrape",
				id: source.scrapeId,
				source: "vibescrape",
				version: 1,
				sourceUrl: source.sourceUrl,
			},
		};
	}
	const checked = validateStudioDesignMd(raw);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	if (!reference) return { designMd: checked.designMd, designReference: null };
	const parsed = studioDesignReferenceSchema.parse(reference);
	if (parsed.kind !== "custom")
		throw new ScrapeError("INVALID_URL", "Referensi desain tidak valid.");
	const designMd = assertDesignMdWithinBudget(raw);
	return {
		designMd,
		designReference: {
			kind: "custom",
			id: createHash("sha256").update(designMd).digest("hex"),
			source: "upload",
			version: 1,
			filename: parsed.filename,
		},
	};
}
