import { createHash } from "node:crypto";
import { ScrapeError } from "./design-errors";
import { validateStudioDesignMd } from "./prompts-ui-studio";
import { extractDesignSystemTokens } from "./studio-design-system";
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

export function resolveStudioDesignReference(
	reference: StudioDesignReference | null | undefined,
	raw: string | null | undefined,
): {
	designMd: string | null;
	designReference: StudioDesignReferenceMetadata | null;
} {
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
	const checked = validateStudioDesignMd(raw);
	if (!checked.ok) throw new ScrapeError("INVALID_URL", checked.error);
	if (!reference) return { designMd: checked.designMd, designReference: null };
	const parsed = studioDesignReferenceSchema.parse(reference);
	if (parsed.kind !== "custom" || !checked.designMd)
		throw new ScrapeError("INVALID_URL", "DESIGN.md diperlukan.");
	if (Buffer.byteLength(raw ?? "", "utf8") > STUDIO_DESIGN_FILE_MAX_BYTES)
		throw new ScrapeError("INVALID_URL", "Ukuran file desain melebihi batas.");
	const tokens = extractDesignSystemTokens(checked.designMd);
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
	return {
		designMd: checked.designMd,
		designReference: {
			kind: "custom",
			id: createHash("sha256").update(checked.designMd).digest("hex"),
			source: "upload",
			version: 1,
			filename: parsed.filename,
		},
	};
}
