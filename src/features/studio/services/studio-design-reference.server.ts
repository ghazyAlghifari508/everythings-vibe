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

export type StudioReferenceFailure =
	| "source-unavailable"
	| "unusable-stored-design"
	| "invalid-design-file"
	| "unknown-theme";

// Recoverable reference failures are their own category. A reference the user
// cannot use is not a missing project, and it must never surface scrape or
// storage vocabulary in the composer.
const REFERENCE_MESSAGES: Record<StudioReferenceFailure, string> = {
	"source-unavailable":
		"Referensi desain ini sudah tidak tersedia. Pilih referensi lain.",
	// The document exists but cannot drive a design system, which is a different
	// problem from a reference that is gone.
	"unusable-stored-design":
		"Referensi desain belum bisa digunakan. Pilih referensi lain atau periksa hasil VibeScrape.",
	"invalid-design-file":
		"File desain belum bisa digunakan. Periksa isinya lalu unggah kembali.",
	"unknown-theme": "Tema desain tidak tersedia. Pilih tema lain.",
};

// The diagnostic stays server-side: the public message is always the category
// copy above, so no internal detail can leak through an error string.
export class StudioReferenceError extends Error {
	constructor(
		readonly failure: StudioReferenceFailure,
		readonly diagnostic?: string,
	) {
		super(REFERENCE_MESSAGES[failure]);
		this.name = "StudioReferenceError";
	}
}

// Every source — a curated preset, an uploaded file, or a stored VibeScrape
// document — passes the same token gate so no reference can smuggle a DESIGN.md
// the design-system enforcer cannot read.
function assertUsableDesignMdTokens(
	designMd: string,
	failure: StudioReferenceFailure,
): void {
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
		throw new StudioReferenceError(
			failure,
			"Token warna DESIGN.md tidak valid.",
		);
	if (
		!tokens ||
		(!tokens.typography.fontFamily &&
			!Object.values(tokens.colors).some(
				(value) => typeof value === "string" && value.length > 0,
			) &&
			!Object.keys(tokens.colors.accents).length)
	)
		throw new StudioReferenceError(
			failure,
			"DESIGN.md harus memuat token warna atau tipografi yang valid.",
		);
}

function assertDesignMdWithinBudget(
	raw: string | null | undefined,
	failure: StudioReferenceFailure,
): string {
	const checked = validateStudioDesignMd(raw);
	if (!checked.ok) throw new StudioReferenceError(failure, checked.error);
	if (!checked.designMd)
		throw new StudioReferenceError(failure, "DESIGN.md diperlukan.");
	if (Buffer.byteLength(raw ?? "", "utf8") > STUDIO_DESIGN_FILE_MAX_BYTES)
		throw new StudioReferenceError(
			failure,
			"Ukuran file desain melebihi batas.",
		);
	assertUsableDesignMdTokens(checked.designMd, failure);
	return checked.designMd;
}

// Codes the scrape helper returns when the reference is gone, owned by someone
// else, or was never completed. getScrapeById reports a missing row and a
// foreign row with the same code because tenant isolation is a WHERE clause.
const UNAVAILABLE_SOURCE_CODES = new Set<string>([
	"WEBSITE_BLOCKED",
	"AI_GENERATION_FAILED",
]);

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
		if (parsed.kind !== "theme")
			throw new StudioReferenceError("unknown-theme");
		const preset = STUDIO_DESIGN_PRESETS.find((item) => item.id === parsed.id);
		const designMd = getStudioPresetDesignMd(parsed.id);
		if (!preset || !designMd) throw new StudioReferenceError("unknown-theme");
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
		if (parsed.kind !== "scrape")
			throw new StudioReferenceError("source-unavailable");
		let source: Awaited<ReturnType<typeof getScrapeDesignMd>>;
		try {
			source = await getScrapeDesignMd(parsed.id, userId);
		} catch (error) {
			if (
				error instanceof ScrapeError &&
				UNAVAILABLE_SOURCE_CODES.has(error.code)
			)
				throw new StudioReferenceError("source-unavailable", error.message);
			throw error;
		}
		const designMd = assertDesignMdWithinBudget(
			source.designMd,
			"unusable-stored-design",
		);
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
	if (!checked.ok)
		throw new StudioReferenceError("invalid-design-file", checked.error);
	if (!reference) return { designMd: checked.designMd, designReference: null };
	const parsed = studioDesignReferenceSchema.parse(reference);
	if (parsed.kind !== "custom")
		throw new StudioReferenceError("invalid-design-file");
	const designMd = assertDesignMdWithinBudget(raw, "invalid-design-file");
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
