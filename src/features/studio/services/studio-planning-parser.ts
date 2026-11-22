import { z } from "zod";
import {
	type StudioDesignMode,
	type StudioScreenPlan,
	studioInitialScopeSchema,
	studioScreenPlanSchema,
} from "@/features/studio/types/studio-prompts";
import { STUDIO_INITIAL_SCREEN_LIMIT } from "../types/studio-constants";
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
	requireVisualDirection = false,
	requireQualityContract = false,
):
	| { ok: true; plan: StudioScreenPlan; blueprint: StudioDesignBlueprint }
	| { ok: false; error: string } {
	const adaptive = expectedCount === null;
	const legacy = adaptive
		? null
		: parseStudioScreenPlan(raw, fallbackViewport, expectedCount);
	if (legacy && !legacy.ok) return legacy;
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
	const planResult = legacy ?? parseAdaptivePlan(parsedJson, fallbackViewport);
	if (!planResult.ok) return planResult;
	const plan = planResult.plan;
	// New plans must choose their family; legacy normalization must not silently choose it for them.
	const hasPlannedLayoutIntent = z
		.object({ productIdentity: z.object({ layoutIntent: z.string() }) })
		.safeParse(record.data.blueprint).success;
	const validated = validateBlueprint(record.data.blueprint);
	if (!validated.ok) return validated;
	const blueprint = validated.blueprint;
	if (
		requireQualityContract &&
		(!blueprint.productIdentity.brandTone ||
			!hasPlannedLayoutIntent ||
			!blueprint.layout ||
			!blueprint.sharedComponents.media ||
			blueprint.screenPlan.some(
				(screen) => !screen.composition || !screen.navigationRole,
			))
	)
		return {
			ok: false,
			error:
				"Planning requires brand tone, shared layout/media and task-specific screen composition/navigation roles.",
		};
	const tokens = validated.blueprint.designTokens;
	if (
		requireVisualDirection &&
		(!tokens.ink || !tokens.muted || !tokens.onPrimary)
	)
		return {
			ok: false,
			error:
				"Visual direction requires ink, muted and onPrimary tokens with WCAG AA contrast.",
		};
	if (validated.blueprint.productIdentity.platform !== fallbackViewport)
		return {
			ok: false,
			error: `Blueprint harus menargetkan platform ${fallbackViewport}.`,
		};
	if (blueprint.screenPlan.length !== plan.screens.length)
		return {
			ok: false,
			error: "Jumlah screen pada blueprint harus sama dengan rencana layar.",
		};
	if (
		plan.screens.some((screen, index) => {
			const shared = validated.blueprint.screenPlan[index];
			return shared.name !== screen.name || shared.order !== screen.order;
		})
	)
		return {
			ok: false,
			error: "Nama dan urutan layar harus sama dengan blueprint bersama.",
		};
	return {
		ok: true,
		plan,
		blueprint: adaptive
			? { ...blueprint, initialScope: plan.scope }
			: blueprint,
	};
}

function parseAdaptivePlan(
	raw: unknown,
	platform: StudioDesignMode,
): { ok: true; plan: StudioScreenPlan } | { ok: false; error: string } {
	const result = studioScreenPlanSchema
		.extend({ scope: studioInitialScopeSchema })
		.safeParse(raw);
	if (!result.success)
		return {
			ok: false,
			error:
				"Return named screens and a scope with requestedCount, rationale and deferred items.",
		};
	const plan = result.data;
	const count = plan.screens.length;
	const requested = plan.scope.requestedCount;
	const names = new Set(
		plan.screens.map((screen) => screen.name.trim().toLowerCase()),
	);
	if (count > STUDIO_INITIAL_SCREEN_LIMIT)
		return {
			ok: false,
			error: `Initial batch must contain at most ${STUDIO_INITIAL_SCREEN_LIMIT} screens.`,
		};
	if (
		names.size !== count ||
		plan.screens.some(
			(screen, index) =>
				!screen.name.trim() ||
				!screen.description.trim() ||
				screen.order !== index ||
				screen.viewport !== platform,
		)
	)
		return {
			ok: false,
			error: `Use unique named ${platform} screens with nonempty descriptions and sequential order starting at 0.`,
		};
	if (
		requested !== null &&
		(count !== Math.min(requested, STUDIO_INITIAL_SCREEN_LIMIT) ||
			(requested > count && !plan.scope.deferred.length))
	)
		return {
			ok: false,
			error: `Honor the explicit count up to ${STUDIO_INITIAL_SCREEN_LIMIT}; list concrete deferred scope if it exceeds the batch.`,
		};
	return { ok: true, plan };
}
