import crypto from "node:crypto";
import {
	type InvalidStudioPrdContent,
	validateStudioPrdText,
} from "./studio-prd-helpers";

export interface ValidatedStudioPrdContent {
	ok: true;
	content: string;
	contentHash: string;
	byteLength: number;
}

export type ValidateStudioPrdContentResult =
	| ValidatedStudioPrdContent
	| InvalidStudioPrdContent;

export function validateStudioPrdContent(
	raw: string | null | undefined,
): ValidateStudioPrdContentResult {
	const validated = validateStudioPrdText(raw);
	if (!validated.ok) return validated;
	const contentHash = crypto
		.createHash("sha256")
		.update(validated.content, "utf8")
		.digest("hex");

	return {
		ok: true,
		content: validated.content,
		contentHash,
		byteLength: validated.byteLength,
	};
}
