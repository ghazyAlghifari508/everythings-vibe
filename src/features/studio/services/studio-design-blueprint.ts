import { z } from "zod";

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
	destinations: z.array(z.string().min(1)).min(1).max(8),
	labels: z.array(z.string().min(1)).min(1).max(8),
	iconMapping: z.record(z.string(), z.string()),
	ordering: z.array(z.string().min(1)).min(1).max(8),
	activeItemRule: z.string().min(1).max(300),
});

export const studioDesignBlueprintSchema = z.object({
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
		visualDirection: z.string().min(1).max(500),
	}),
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
	}),
	navigationContract: studioNavigationContractSchema,
	canonicalShell: studioCanonicalShellSchema.optional(),
	// ponytail: max 12 screens covers Studio canvas add-screen growth; upgrade when canvas pagination is introduced.
	screenPlan: z
		.array(
			z.object({
				name: z.string().min(1).max(100),
				role: z.string().min(1).max(500),
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
	if (!parsed.success)
		return {
			ok: false,
			error: "Blueprint desain tidak memenuhi skema tervalidasi.",
		};
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
	const shell = blueprint.canonicalShell;
	if (
		shell &&
		(mobile ? shell.navigation !== "bottom" : shell.navigation === "bottom")
	)
		return { ok: false, error: "Shell navigasi tidak sesuai platform." };
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
				navigation: mobile ? "bottom" : "sidebar",
				statusBar: "none",
				density: "comfortable",
				activeDestinations,
			},
		},
	};
}
