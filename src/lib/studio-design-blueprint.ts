import { z } from "zod";

export const studioNavigationContractSchema = z.object({
	destinations: z.array(z.string().min(1)).min(1).max(8),
	labels: z.array(z.string().min(1)).min(1).max(8),
	iconMapping: z.record(z.string(), z.string()),
	ordering: z.array(z.string().min(1)).min(1).max(8),
	activeItemRule: z.string().min(1).max(300),
});

export const studioDesignBlueprintSchema = z.object({
	productIdentity: z.object({
		productName: z.string().min(1).max(200),
		targetAudience: z.string().min(1).max(300),
		platform: z.enum(["web", "mobile"]),
		visualDirection: z.string().min(1).max(500),
	}),
	designTokens: z.object({
		primary: z.string().min(1).max(50),
		secondary: z.string().min(1).max(50),
		background: z.string().min(1).max(50),
		surface: z.string().min(1).max(50),
		fontFamily: z.string().min(1).max(200),
		radius: z.number().min(0).max(32),
		border: z.string().min(1).max(100),
		elevation: z.string().min(1).max(100),
	}),
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
	screenPlan: z
		.array(
			z.object({
				name: z.string().min(1).max(100),
				role: z.string().min(1).max(500),
				order: z.number().int().nonnegative(),
			}),
		)
		.min(1)
		.max(5),
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
	const orders = parsed.data.screenPlan.map((s) => s.order);
	if (new Set(orders).size !== orders.length)
		return { ok: false, error: "Order screen harus unik dan berurutan." };
	return { ok: true, blueprint: parsed.data };
}
