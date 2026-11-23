export interface Feature {
	key: string;
	name: string;
	isIncluded: boolean;
	tooltip?: string;
}

export interface PriceTier {
	id: "free" | "pro" | "hengker";
	name: string;
	description: string;
	/** Monthly price in IDR. Credits reset every BILLING_PERIOD_DAYS. */
	price: number;
	credits: number;
	isPopular: boolean;
	buttonLabel: string;
	features: Feature[];
}

/**
 * Shared row order so the comparison table lines up across tiers.
 * Entitlements follow the approved 30-day package policy: Free has basic
 * VibePlan plus one-time Studio/Scrape trials, paid tiers have full access.
 * Studio/Scrape credit charging is not active, so no tariff is claimed here.
 */
const FEATURE_ROWS = [
	{ key: "vibeplan", name: "VibePlan" },
	{ key: "studio-trial", name: "Trial Studio (1x)" },
	{ key: "scrape-trial", name: "Trial Scrape (1x)" },
	{ key: "studio", name: "Studio" },
	{ key: "scrape", name: "Scrape" },
	{ key: "template", name: "VibeTemplate" },
	{ key: "vibeplan-revision", name: "Revisi PRD via chat" },
	{ key: "export-md", name: "Export Markdown" },
	{ key: "workflow", name: "AC, Task, dan Kanban" },
	{ key: "share", name: "Share link PRD" },
	{ key: "version-30", name: "Riwayat 30 versi" },
	{ key: "version-unlimited", name: "Riwayat versi tak terbatas" },
	{ key: "priority", name: "Antrean prioritas" },
	{ key: "monthly-reset", name: "Kredit direset tiap 30 hari" },
] as const;

function buildFeatures(included: readonly string[]): Feature[] {
	return FEATURE_ROWS.map((row) => ({
		key: row.key,
		name: row.name,
		isIncluded: included.includes(row.key),
	}));
}

export const prdFyPlans: [PriceTier, PriceTier, PriceTier] = [
	{
		id: "free",
		name: "Free",
		description:
			"VibePlan dasar, trial Studio dan Scrape, VibeTemplate. 2 kredit per 30 hari.",
		price: 0,
		credits: 2,
		isPopular: false,
		buttonLabel: "Mulai Gratis",
		features: buildFeatures([
			"vibeplan",
			"studio-trial",
			"scrape-trial",
			"template",
			"vibeplan-revision",
			"export-md",
			"monthly-reset",
		]),
	},
	{
		id: "pro",
		name: "Pro",
		description:
			"VibePlan penuh, Studio, Scrape, dan VibeTemplate. 30 kredit per 30 hari.",
		price: 49000,
		credits: 30,
		isPopular: true,
		buttonLabel: "Berlangganan Pro",
		features: buildFeatures([
			"vibeplan",
			"studio",
			"scrape",
			"template",
			"vibeplan-revision",
			"export-md",
			"workflow",
			"share",
			"version-30",
			"monthly-reset",
		]),
	},
	{
		id: "hengker",
		name: "Hengker",
		// No "model premium" claim: all tiers share the single 9Router
		// combo with no user-facing picker, so Hengker must not promise a
		// different model.
		description:
			"VibePlan prioritas, Studio, Scrape, dan VibeTemplate. 105 kredit per 30 hari.",
		price: 149000,
		credits: 105,
		isPopular: false,
		buttonLabel: "Berlangganan Hengker",
		features: buildFeatures(FEATURE_ROWS.map((row) => row.key)),
	},
];
