import { mergePrdRevision } from "@/features/greenfield/utils/prd-revision-merge";
import { MAX_RESUME_CONTENT_CHARS } from "@/lib/constants";
import { isTruncatedGeneration } from "@/lib/flow-progress";
import { revisionPrdOutputSchema } from "./revision-prompt";

export function validateRevisionPrdResponse(
	base: string,
	raw: string,
	finishReason: string | undefined,
) {
	if (
		raw.length > MAX_RESUME_CONTENT_CHARS ||
		finishReason === "aborted" ||
		isTruncatedGeneration(raw, finishReason)
	)
		return { kind: "invalid" as const };
	try {
		return validateRevisionPrdOutput(base, JSON.parse(raw));
	} catch {
		return { kind: "invalid" as const };
	}
}

export function validateRevisionPrdOutput(base: string, input: unknown) {
	const parsed = revisionPrdOutputSchema.safeParse(input);
	if (!parsed.success) return { kind: "invalid" as const };
	if (parsed.data.kind === "conflict") return parsed.data;
	const proposal = parseRevisionPrdPatch(base, parsed.data.patch);
	return proposal.ok
		? {
				kind: "proposal" as const,
				content: proposal.content,
				sections: proposal.sections,
			}
		: { kind: "invalid" as const };
}

export function parseRevisionPrdPatch(base: string, response: string) {
	const pattern =
		/:::UPDATE_SECTION\[([^\]\r\n]+)\]:::\s*([\s\S]*?):::END_UPDATE:::/g;
	const matches = [...response.matchAll(pattern)];
	const names = matches.map((match) => match[1].trim());
	const remainder = response.replace(pattern, "").trim();
	const sectionNames = [...base.matchAll(/<!-- SECTION: (.*?) -->/g)].map(
		(match) => match[1],
	);
	if (
		!matches.length ||
		remainder ||
		names.some((name) => !name) ||
		new Set(names).size !== names.length ||
		names.some(
			(name) => sectionNames.filter((section) => section === name).length !== 1,
		) ||
		matches.some(
			(match) =>
				!match[2].trim() ||
				/<!--\s*\/?SECTION\b/i.test(match[2]) ||
				/:::UPDATE_SECTION\[/.test(match[2]),
		)
	)
		return { ok: false as const };
	for (const name of names) {
		const start = base.indexOf(`<!-- SECTION: ${name} -->`);
		const next = base.indexOf("<!-- SECTION:", start + 1);
		const close = base.indexOf("<!-- /SECTION -->", start + 1);
		if (next !== -1 && (close === -1 || next < close))
			return { ok: false as const };
	}
	for (const match of matches) {
		const single = mergePrdRevision(base, match[0]);
		if (single.patchedSections.length !== 1 || single.merged === base)
			return { ok: false as const };
	}
	const result = mergePrdRevision(base, response);
	if (result.patchedSections.length !== names.length || result.merged === base)
		return { ok: false as const };
	return {
		ok: true as const,
		content: result.merged,
		sections: result.patchedSections,
	};
}
