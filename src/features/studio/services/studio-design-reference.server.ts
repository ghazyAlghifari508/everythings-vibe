import { createHash } from "node:crypto";
import { getScrapeDesignMd } from "@/features/scrape/services/scrape-design-md-service";
import { ScrapeError } from "@/lib/design-errors";
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
import { inspectStudioDesignMd } from "./studio-prompt-validation";

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
		"File desain belum bisa digunakan. Periksa bagian warna, tipografi, atau radius di dalamnya, lalu coba lagi.",
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
// document — passes the same preflight so no reference can smuggle a DESIGN.md
// the design-system enforcer cannot read.
function assertDesignMdWithinBudget(
	raw: string | null | undefined,
	failure: StudioReferenceFailure,
): string {
	const checked = inspectStudioDesignMd(raw);
	if (!checked.ok) throw new StudioReferenceError(failure, checked.error);
	if (Buffer.byteLength(raw ?? "", "utf8") > STUDIO_DESIGN_FILE_MAX_BYTES)
		throw new StudioReferenceError(
			failure,
			"Ukuran file desain melebihi batas.",
		);
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
	// An explicit null is the user choosing no reference, so a document sent
	// alongside it is not promoted into one behind their back.
	if (reference === null) return { designMd: null, designReference: null };
	if (reference === undefined) {
		// Without a typed reference the document itself is the reference, so it
		// passes the same preflight instead of reaching the pipeline unread.
		if (raw === null || raw === undefined || raw === "") {
			return { designMd: null, designReference: null };
		}
		return {
			designMd: assertDesignMdWithinBudget(raw, "invalid-design-file"),
			designReference: null,
		};
	}
	if (reference.kind === "theme") {
		const parsed = studioDesignReferenceSchema.parse(reference);
		if (parsed.kind !== "theme")
			throw new StudioReferenceError("unknown-theme");
		const preset = STUDIO_DESIGN_PRESETS.find((item) => item.id === parsed.id);
		const presetMd = getStudioPresetDesignMd(parsed.id);
		if (!preset || !presetMd) throw new StudioReferenceError("unknown-theme");
		// A preset is trusted input, not exempt input: a curated theme that the
		// parser cannot read would fail every frame downstream.
		return {
			designMd: assertDesignMdWithinBudget(presetMd, "unknown-theme"),
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
	if (reference.kind === "scrape") {
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
