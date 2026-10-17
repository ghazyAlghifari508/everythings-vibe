import { z } from "zod";
import {
	type StudioDesignMode,
	type StudioScreenPlan,
	studioScreenPlanSchema,
} from "@/features/studio/types/studio-prompts";
import {
	type StudioDesignBlueprint,
	validateBlueprint,
} from "./studio-design-blueprint";

export function parseStudioScreenPlan(
	raw: string,
	fallbackViewport: StudioDesignMode = "web",
	expectedCount?: number | null,
): { ok: true; plan: StudioScreenPlan } | { ok: false; error: string } {
	try {
		const clean = raw
			.replace(/^```json\s*/im, "")
			.replace(/^```\s*/im, "")
			.replace(/\s*```$/im, "")
			.trim();
		const firstBrace = clean.indexOf("{");
		const lastBrace = clean.lastIndexOf("}");
		if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
			return {
				ok: false,
				error: "Format JSON tidak ditemukan pada output perencana layar.",
			};
		}
		let jsonString = clean.slice(firstBrace, lastBrace + 1);
		// Strip trailing commas before closing braces/brackets
		jsonString = jsonString.replace(/,\s*([\]}])/g, "$1");

		const parsedJson: unknown = JSON.parse(jsonString);
		if (typeof parsedJson !== "object" || parsedJson === null)
			return { ok: false, error: "Rencana layar harus berupa object." };
		if (expectedCount != null) {
			const strict = studioScreenPlanSchema.safeParse(parsedJson);
			if (
				!strict.success ||
				strict.data.screens.length !== expectedCount ||
				strict.data.screens.some(
					(screen, index) =>
						screen.viewport !== fallbackViewport || screen.order !== index,
				)
			)
				return {
					ok: false,
					error: `Rencana harus memuat tepat ${expectedCount} layar ${fallbackViewport} berurutan.`,
				};
			return { ok: true, plan: strict.data };
		}
		const object = z.record(z.string(), z.unknown()).parse(parsedJson);

		const rawTitle =
			typeof object.projectTitle === "string" && object.projectTitle.trim()
				? object.projectTitle.trim()
				: typeof object.title === "string" && object.title.trim()
					? object.title.trim()
					: "Aplikasi Prototipe";

		const rawScreens = Array.isArray(object.screens) ? object.screens : [];

		const normalizedScreens = rawScreens.map((item, idx) => {
			if (typeof item !== "object" || item === null) {
				return {
					name: `Layar ${idx + 1}`,
					description: "",
					viewport: fallbackViewport,
					order: idx,
				};
			}
			const screenObj = z.record(z.string(), z.unknown()).parse(item);
			const name =
				typeof screenObj.name === "string" && screenObj.name.trim()
					? screenObj.name.trim()
					: typeof screenObj.title === "string" && screenObj.title.trim()
						? screenObj.title.trim()
						: `Layar ${idx + 1}`;
			const description =
				typeof screenObj.description === "string"
					? screenObj.description.trim()
					: "";
			const viewport =
				screenObj.viewport === "mobile" || screenObj.viewport === "web"
					? screenObj.viewport
					: fallbackViewport;
			const order =
				typeof screenObj.order === "number" && !Number.isNaN(screenObj.order)
					? screenObj.order
					: idx;

			return {
				name,
				description,
				viewport,
				order,
			};
		});

		const result = studioScreenPlanSchema.safeParse({
			projectTitle: rawTitle,
			screens: normalizedScreens,
		});

		if (!result.success) {
			return {
				ok: false,
				error: "Struktur rencana layar tidak memenuhi skema yang valid.",
			};
		}
		return { ok: true, plan: result.data };
	} catch {
		return { ok: false, error: "Gagal mem-parse respon JSON rencana layar." };
	}
}

export function parseStudioPlanningWithBlueprint(
	raw: string,
	fallbackViewport: StudioDesignMode = "web",
	expectedCount?: number | null,
):
	| { ok: true; plan: StudioScreenPlan; blueprint: StudioDesignBlueprint }
	| { ok: false; error: string } {
	const planParsed = parseStudioScreenPlan(
		raw,
		fallbackViewport,
		expectedCount,
	);
	if (!planParsed.ok) return planParsed;
	let parsedJson: unknown;
	try {
		const clean = raw
			.replace(/^```json\s*/im, "")
			.replace(/^```\s*/im, "")
			.replace(/\s*```$/im, "")
			.trim();
		const firstBrace = clean.indexOf("{");
		const lastBrace = clean.lastIndexOf("}");
		if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
			return {
				ok: false,
				error: "Format JSON tidak ditemukan pada output perencana layar.",
			};
		}
		parsedJson = JSON.parse(
			clean.slice(firstBrace, lastBrace + 1).replace(/,\s*([\]}])/g, "$1"),
		);
	} catch {
		return { ok: false, error: "Gagal mem-parse respon JSON rencana layar." };
	}
	if (typeof parsedJson !== "object" || parsedJson === null)
		return { ok: false, error: "Rencana layar harus berupa object." };
	const record = z.record(z.string(), z.unknown()).safeParse(parsedJson);
	if (!record.success || record.data.blueprint === undefined)
		return {
			ok: false,
			error: "Blueprint desain bersama tidak ditemukan pada output perencana.",
		};
	const validated = validateBlueprint(record.data.blueprint);
	if (!validated.ok) return validated;
	if (validated.blueprint.productIdentity.platform !== fallbackViewport)
		return {
			ok: false,
			error: `Blueprint harus menargetkan platform ${fallbackViewport}.`,
		};
	if (validated.blueprint.screenPlan.length !== planParsed.plan.screens.length)
		return {
			ok: false,
			error: "Jumlah screen pada blueprint harus sama dengan rencana layar.",
		};
	return {
		ok: true,
		plan: planParsed.plan,
		blueprint: validated.blueprint,
	};
}
