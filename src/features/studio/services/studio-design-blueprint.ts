import { z } from "zod";
import { studioInitialScopeSchema } from "../types/studio-prompts";
import { STUDIO_COMPONENT_PATTERN_IDS } from "./studio-component-patterns";

const canonicalIconIds = new Set([
	"home",
	"plus",
	"search",
	"user",
	"wallet",
	"chart",
	"analytics",
	"calendar",
	"location",
	"plane",
	"settings",
	"circle",
]);

export function canonicalIconId(value: string | undefined): string {
	return value && canonicalIconIds.has(value) ? value : "circle";
}

const safeCss = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[^;{}<>\\\\]*$/)
	.refine((value) => !/url\s*\(|expression\s*\(/i.test(value));
const color = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}(?:ff)?)$/i);

export function studioColorContrast(
	foreground: string,
	background: string,
): number {
	const luminance = (hex: string) => {
		const raw = hex.slice(1);
		const full = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
		const channels = [0, 2, 4].map((offset) => {
			const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
			return value <= 0.04045
				? value / 12.92
				: ((value + 0.055) / 1.055) ** 2.4;
		});
		return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
	};
	const a = luminance(foreground);
	const b = luminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const studioCanonicalShellSchema = z.object({
	version: z.literal(1),
	navigation: z.enum(["bottom", "sidebar", "top"]),
	statusBar: z.literal("none"),
	density: z.enum(["compact", "comfortable"]),
	activeDestinations: z.record(z.string(), z.string().nullable()),
});

export const studioNavigationContractSchema = z.object({
	destinations: z.array(z.string().min(1)).max(8),
	labels: z.array(z.string().min(1)).max(8),
	iconMapping: z.record(z.string(), z.string()),
	ordering: z.array(z.string().min(1)).max(8),
	activeItemRule: z.string().min(1).max(300),
	ctaDestination: z.string().min(1).nullable().optional(),
	primaryAction: z
		.object({
			id: z
				.string()
				.regex(/^[a-z0-9-]+$/)
				.max(48),
			label: z.string().trim().min(1).max(80),
			goal: z.string().trim().min(1).max(180),
			target: z.string().min(1).max(100),
		})
		.optional(),
});

const orderedScale = (minimum: number, maximum: number) =>
	z
		.array(z.number().min(minimum).max(maximum))
		.min(2)
		.max(8)
		.refine((values) =>
			values.every((value, index) => index === 0 || value > values[index - 1]),
		);

const screenCompositionSchema = z.object({
	primaryTask: z.string().trim().min(1).max(200),
	layout: z.enum([
		"editorial",
		"discovery",
		"detail",
		"form",
		"summary",
		"timeline",
		"workspace",
	]),
	hierarchy: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
	// Patterns are advisory hints. A model that names an unknown pattern
	// must not fail the whole plan: keep the closed server-owned set and
	// drop values it cannot act on.
	patterns: z.preprocess(
		(value) => {
			if (value === null || value === undefined) return [];
			if (!Array.isArray(value)) return value;
			const allowed = new Set<string>(STUDIO_COMPONENT_PATTERN_IDS);
			return value.filter(
				(id): id is (typeof STUDIO_COMPONENT_PATTERN_IDS)[number] =>
					typeof id === "string" && allowed.has(id),
			);
		},
		z.array(z.enum(STUDIO_COMPONENT_PATTERN_IDS)).max(8),
	),
	responsive: z.enum([
		"reflow",
		"stack",
		"grid",
		"horizontal-scroll",
		"expand",
	]),
	media: z.enum(["none", "whole-product", "photography", "project-work"]),
});

const shortFact = z.string().trim().min(1).max(120);
export const studioSampleDataSchema = z.object({
	currency: z.string().trim().min(1).max(24).optional(),
	dateFormat: z.string().trim().min(1).max(40).optional(),
	sampleDates: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
	sampleStatuses: z.array(shortFact).max(8).optional(),
	note: z.string().trim().min(1).max(240).optional(),
});
export const studioDesignBlueprintSchema = z.object({
	initialScope: studioInitialScopeSchema.optional(),
	explicitColorOverrides: z
		.array(
			z.enum(["primary", "background", "surface", "ink", "muted", "border"]),
		)
		.max(6)
		.optional(),
	productIdentity: z.object({
		productName: z.string().min(1).max(200),
		targetAudience: z.string().min(1).max(300),
		platform: z.enum(["web", "mobile"]),
		layoutIntent: z
			.enum(["public-website", "web-application", "mobile-application"])
			.optional(),
		visualDirection: z.string().min(1).max(500),
		brandTone: z.string().trim().min(1).max(200).optional(),
	}),
	sampleData: studioSampleDataSchema.optional(),
	designTokens: z
		.object({
			primary: color,
			secondary: color,
			background: color,
			surface: color,
			// ponytail: optional for persisted legacy blueprints; new planning requests require these tokens.
			ink: color.optional(),
			muted: color.optional(),
			onPrimary: color.optional(),
			fontFamily: safeCss,
			radius: z.number().min(0).max(32),
			border: safeCss,
			elevation: safeCss,
		})
		.refine((tokens) => {
			const readable = (
				foreground: string | undefined,
				backgrounds: string[],
			) =>
				!foreground ||
				backgrounds.every(
					(background) => studioColorContrast(foreground, background) >= 4.5,
				);
			return (
				readable(tokens.ink, [tokens.background, tokens.surface]) &&
				readable(tokens.muted, [tokens.background, tokens.surface]) &&
				readable(tokens.onPrimary, [tokens.primary])
			);
		}, "Text contrast must reach WCAG AA (4.5:1)."),
	sharedComponents: z.object({
		header: z.string().min(1).max(500),
		navigation: z.string().min(1).max(500),
		buttons: z.string().min(1).max(500),
		inputs: z.string().min(1).max(500),
		cards: z.string().min(1).max(500),
		tabs: z.string().min(1).max(500),
		icons: z.string().min(1).max(300),
		media: z.string().trim().min(1).max(300).optional(),
	}),
	navigationContract: studioNavigationContractSchema,
	canonicalShell: studioCanonicalShellSchema.optional(),
	compositionOwner: z.literal("model").optional(),
	layout: z
		.object({
			gutter: z.number().min(0).max(64),
			contentMaxWidth: z.number().min(240).max(1920),
			spacing: orderedScale(0, 128),
			typography: orderedScale(12, 96),
		})
		.optional(),
	// ponytail: max 12 screens covers Studio canvas add-screen growth; upgrade when canvas pagination is introduced.
	screenPlan: z
		.array(
			z.object({
				name: z.string().min(1).max(100),
				role: z.string().min(1).max(500),
				// Models routinely emit `null` for "no destination" (the prompt
				// itself uses null for parentDestinationId). Normalize it to
				// absent instead of rejecting an otherwise valid plan.
				navigationRole: z.preprocess(
					(value) => (value === null ? undefined : value),
					z.enum(["primary", "contextual"]).optional(),
				),
				destinationId: z.preprocess(
					(value) => (value === null ? undefined : value),
					z.string().optional(),
				),
				parentDestinationId: z.string().nullable().optional(),
				// Persisted legacy screens and deterministic additions can retain role-only intent.
				composition: screenCompositionSchema.optional(),
				photos: z
					.array(
						z.object({
							id: z.string().regex(/^[a-z0-9-]{1,40}$/),
							subject: z.string().trim().min(1).max(100),
							purpose: z.string().trim().min(1).max(120),
							query: z.string().trim().min(1).max(100),
							aspect: z.enum(["landscape", "portrait", "square"]),
							alt: z.string().trim().min(1).max(120),
							source: z.enum(["stock", "user"]),
						}),
					)
					.max(3)
					.refine(
						(photos) =>
							new Set(photos.map(({ id }) => id)).size === photos.length,
					)
					.optional(),
				order: z.number().int().nonnegative(),
			}),
		)
		.min(1)
		.max(12),
});

export type StudioDesignBlueprint = z.infer<typeof studioDesignBlueprintSchema>;

export function validateBlueprint(
	input: unknown,
):
	| { ok: true; blueprint: StudioDesignBlueprint }
	| { ok: false; error: string } {
	const parsed = studioDesignBlueprintSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		const issuePath = firstIssue?.path.length
			? ` (${firstIssue.path.join(".")}: ${firstIssue.message})`
			: "";
		return {
			ok: false,
			error: `Blueprint desain tidak memenuhi skema tervalidasi${issuePath}.`,
		};
	}
	if (
		parsed.data.navigationContract.labels.length !==
		parsed.data.navigationContract.destinations.length
	)
		return {
			ok: false,
			error: "Jumlah label navigasi harus sama dengan destinasi.",
		};
	const { destinations, ordering } = parsed.data.navigationContract;
	if (ordering.length !== destinations.length)
		return {
			ok: false,
			error: "Urutan navigasi harus memuat semua destinasi.",
		};
	if (new Set(ordering).size !== ordering.length)
		return {
			ok: false,
			error: "Urutan navigasi tidak boleh duplikat.",
		};
	if (
		!ordering.every((entry) => destinations.includes(entry)) ||
		!destinations.every((entry) => ordering.includes(entry))
	)
		return {
			ok: false,
			error: "Urutan navigasi harus menjadi permutasi destinasi.",
		};
	const orders = parsed.data.screenPlan.map((s) => s.order);
	if (new Set(orders).size !== orders.length)
		return { ok: false, error: "Order screen harus unik dan berurutan." };
	const blueprint = parsed.data;
	const mobile = blueprint.productIdentity.platform === "mobile";
	const layoutIntent =
		blueprint.productIdentity.layoutIntent ??
		(mobile ? "mobile-application" : "web-application");
	if ((layoutIntent === "mobile-application") !== mobile)
		return { ok: false, error: "Layout intent tidak sesuai platform." };
	const cta = blueprint.navigationContract.ctaDestination;
	if (cta && !destinations.includes(cta))
		return { ok: false, error: "Destinasi CTA tidak dikenal." };
	const shell = blueprint.canonicalShell;
	if (
		shell &&
		(mobile ? shell.navigation !== "bottom" : shell.navigation === "bottom")
	)
		return { ok: false, error: "Shell navigasi tidak sesuai platform." };
	if (shell && layoutIntent === "public-website" && shell.navigation !== "top")
		return { ok: false, error: "Website publik memerlukan navigasi atas." };
	if (
		shell &&
		Object.values(shell.activeDestinations).some(
			(id) => id !== null && !destinations.includes(id),
		)
	)
		return { ok: false, error: "Destinasi aktif tidak dikenal." };
	const names = blueprint.screenPlan.map((screen) => screen.name);
	if (new Set(names).size !== names.length)
		return { ok: false, error: "Nama layar harus unik." };
	if (blueprint.compositionOwner === "model") {
		if (shell || cta)
			return {
				ok: false,
				error:
					"Model composition cannot request a fixed shell or promote a navigation link.",
			};
		if (
			blueprint.screenPlan.some(
				(screen) =>
					screen.composition?.media === "photography" && !screen.photos?.length,
			)
		)
			return {
				ok: false,
				error: "Photography requires at least one planned photo slot.",
			};
		// A contextual screen may repeat its parent's destinationId even though
		// the prompt says only the owning primary screen does. Treat that as the
		// parent relationship it describes instead of rejecting a usable plan.
		const screenPlan = blueprint.screenPlan.map((screen) =>
			screen.navigationRole !== "primary" && screen.destinationId
				? {
						...screen,
						destinationId: undefined,
						parentDestinationId:
							screen.parentDestinationId ?? screen.destinationId,
					}
				: screen,
		);
		const destinationIds = screenPlan.flatMap((screen) =>
			screen.destinationId ? [screen.destinationId] : [],
		);
		if (
			destinations.some((id) => !/^[a-z0-9-]{1,48}$/.test(id)) ||
			destinationIds.length !== destinations.length ||
			new Set(destinationIds).size !== destinations.length ||
			!destinations.every((id) => destinationIds.includes(id)) ||
			screenPlan.some(
				(screen) =>
					!screen.navigationRole ||
					(screen.destinationId && screen.navigationRole !== "primary") ||
					(screen.parentDestinationId &&
						(screen.navigationRole !== "contextual" ||
							!destinations.includes(screen.parentDestinationId))),
			)
		)
			return {
				ok: false,
				error: "Invalid screen-to-destination or parent relationship.",
			};
		const action = blueprint.navigationContract.primaryAction;
		if (
			action &&
			(destinations.includes(action.id) ||
				!names.includes(action.target) ||
				blueprint.navigationContract.labels.some(
					(label) => label.trim().toLowerCase() === action.label.toLowerCase(),
				))
		)
			return {
				ok: false,
				error:
					"Primary action requires a separate label, id and a known target screen.",
			};
		return {
			ok: true,
			blueprint: {
				...blueprint,
				screenPlan,
				productIdentity: { ...blueprint.productIdentity, layoutIntent },
			},
		};
	}
	if (destinations.length === 0)
		return { ok: false, error: "Legacy navigation requires a destination." };
	const activeDestinations = Object.fromEntries(
		names.map((name) => {
			const index = blueprint.navigationContract.labels.findIndex(
				(label) => label.toLowerCase() === name.toLowerCase(),
			);
			return [
				name,
				shell?.activeDestinations[name] ??
					(index >= 0
						? destinations[index]
						: destinations.find(
								(id) => id.toLowerCase() === name.toLowerCase(),
							)) ??
					null,
			];
		}),
	);
	return {
		ok: true,
		blueprint: {
			...blueprint,
			productIdentity: { ...blueprint.productIdentity, layoutIntent },
			navigationContract: {
				...blueprint.navigationContract,
				iconMapping: Object.fromEntries(
					destinations.map((id) => [
						id,
						canonicalIconId(blueprint.navigationContract.iconMapping[id]),
					]),
				),
			},
			canonicalShell: shell ?? {
				version: 1,
				navigation: mobile
					? "bottom"
					: layoutIntent === "public-website"
						? "top"
						: "sidebar",
				statusBar: "none",
				density: "comfortable",
				activeDestinations,
			},
		},
	};
}
