import type { Plan } from "@/types/database";

export const PLAN_CREDITS: Record<Plan, number> = {
	free: 2,
	pro: 30,
	hengker: 105,
};

export const PLAN_PRICES: Record<Plan, number> = {
	free: 0,
	pro: 49000,
	hengker: 149000,
};

export const FEATURES: Record<
	Plan,
	{
		downloadMd: boolean;
		shareLink: boolean;
		versionHistory: false | number;
		priorityQueue: boolean;
		fullWorkflow: boolean;
	}
> = {
	free: {
		downloadMd: true,
		shareLink: false,
		versionHistory: false,
		priorityQueue: false,
		fullWorkflow: false,
	},
	pro: {
		downloadMd: true,
		shareLink: true,
		versionHistory: 30,
		priorityQueue: false,
		fullWorkflow: true,
	},
	hengker: {
		downloadMd: true,
		shareLink: true,
		versionHistory: -1,
		priorityQueue: true,
		fullWorkflow: true,
	},
};
