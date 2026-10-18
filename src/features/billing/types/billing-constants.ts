export const BILLING_PERIOD_DAYS = 30;
export const PRE_EXPIRY_NOTICE_DAYS = 3;
export const REMINDER_SCHEDULE_DAYS = [1, 7, 14] as const;

export interface TopUpPackage {
	id: string;
	name: string;
	credits: number;
	priceIdr: number;
	description: string;
	recommended?: boolean;
}

export const TOPUP_PACKAGES: readonly TopUpPackage[] = [
	{
		id: "topup-15",
		name: "Paket 15 Kredit",
		credits: 15,
		priceIdr: 20000,
		description: "Tambahan 15 kredit instan untuk sprint kecil",
	},
	{
		id: "topup-40",
		name: "Paket 40 Kredit",
		credits: 40,
		priceIdr: 50000,
		description: "Pilihan terbaik untuk eksplorasi banyak fitur",
		recommended: true,
	},
	{
		id: "topup-90",
		name: "Paket 90 Kredit",
		credits: 90,
		priceIdr: 100000,
		description: "Kapasitas penuh untuk proyek besar & enterprise",
	},
] as const;

export const TOPUP_SKU = TOPUP_PACKAGES[0];

export function findTopUpPackage(
	planId: string | null | undefined,
): TopUpPackage | undefined {
	return TOPUP_PACKAGES.find((p) => p.id === planId);
}

export const ADAPTIVE_CREDIT_PRICING = {
	version: "adaptive-v1",
	thresholds: {
		promptChars: 4_000,
		prdSourceChars: 12_000,
		featureCount: 4,
		personaCount: 3,
		workflowCount: 3,
		requirementCount: 8,
		constraintCount: 5,
		taskCount: 8,
		fileCount: 100,
		sourceBytes: 250_000,
		languageCount: 3,
		dependencyCount: 20,
		relationshipCount: 100,
	} as const,
	weights: {
		promptChars: 0.25,
		prdSourceChars: 0.5,
		taskCount: 0.5,
		featureCount: 0.5,
		personaCount: 0.25,
		workflowCount: 0.5,
		requirementCount: 0.25,
		constraintCount: 0.25,
		fileCount: 0.5,
		sourceBytes: 0.5,
		languageCount: 0.25,
		dependencyCount: 0.25,
		relationshipCount: 0.25,
		codebaseContext: 0.5,
	} as const,
	operations: {
		codebase_analysis: { baseCredits: 2, maximumCredits: 12 },
		prd_generation: { baseCredits: 1, maximumCredits: 8 },
		ac_generation: { baseCredits: 1, maximumCredits: 6 },
		task_generation: { baseCredits: 1, maximumCredits: 8 },
	} as const,
} as const;
