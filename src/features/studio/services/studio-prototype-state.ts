import {
	type StudioPrototypeIssue,
	studioPrototypeStateKeySchema,
	studioPrototypeStateSchema,
	studioPrototypeStateValueSchema,
} from "../types/studio-prototype";

export const STUDIO_PROTOTYPE_SENSITIVE_ATTR = "data-ev-sensitive";
const sensitiveField =
	/(?:password|passwd|kata-?sandi|card|kartu|cvv|cvc|otp|\bpin\b|account-?number|rekening|iban|\bssn\b|\bnik\b)/i;

export function readStudioPrototypeState(
	document: Document,
	report: (issue: StudioPrototypeIssue) => void,
) {
	for (const field of document.querySelectorAll("input,textarea")) {
		const hint = `${field.getAttribute("type") ?? ""} ${field.getAttribute("name") ?? ""} ${field.id} ${field.getAttribute("autocomplete") ?? ""}`;
		if (
			(field.getAttribute("type") ?? "").toLowerCase() !== "password" &&
			!sensitiveField.test(hint)
		)
			continue;
		field.setAttribute(STUDIO_PROTOTYPE_SENSITIVE_ATTR, "1");
		field.setAttribute("autocomplete", "off");
		report({
			code: "SENSITIVE_FIELD",
			message:
				"Kolom data sensitif ditandai; prototipe tidak menyimpan nilainya.",
		});
	}
	const rawDefaults: Record<string, unknown> = {};
	for (const element of document.querySelectorAll("[data-proto-default-key]")) {
		const key = element.getAttribute("data-proto-default-key")?.trim() ?? "";
		const value = studioPrototypeStateValueSchema.safeParse(
			element.getAttribute("data-proto-default-value")?.trim() ?? "",
		);
		if (studioPrototypeStateKeySchema.safeParse(key).success && value.success)
			rawDefaults[key] = value.data;
	}
	const parsed = studioPrototypeStateSchema.safeParse(rawDefaults);
	if (parsed.success) return parsed.data;
	if (Object.keys(rawDefaults).length > 0)
		report({
			code: "INVALID_PARAMETER",
			message: "State awal prototipe melebihi batas dan diabaikan.",
		});
	return {};
}
