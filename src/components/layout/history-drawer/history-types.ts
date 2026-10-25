import type { HistoryItem } from "@/lib/history";

export type DrawerCategory = "plan";

export interface DrawerHistoryItem {
	id: string;
	name: string;
	type: DrawerCategory;
	updatedAt: Date;
	url: string;
	step?: string | null;
	preview?: string | null;
	acStatus?: string | null;
	taskStatus?: string | null;
}

export interface WireHistoryItem extends Omit<HistoryItem, "updatedAt"> {
	updatedAt: Date | string;
}

export type CategoryFilter = "all" | DrawerCategory;

export type HistoryFailure = "session" | "blocked" | "server";

export interface HistoryDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	override?: { items: DrawerHistoryItem[]; isLoading?: boolean };
}

export const CATEGORY_LABEL: Record<DrawerCategory, string> = {
	plan: "VibePlan",
};

export const CATEGORY_FILTERS: ReadonlyArray<{
	value: CategoryFilter;
	label: string;
}> = [
	{ value: "all", label: "Semua" },
	{ value: "plan", label: CATEGORY_LABEL.plan },
];

export const EMPTY_STATE_BY_FILTER: Record<CategoryFilter, string> = {
	all: "Belum ada riwayat projek.",
	plan: "Belum ada VibePlan tersimpan.",
};

export const NO_MATCH_MESSAGE = "Tidak ada proyek yang cocok dengan pencarian.";

export const ANONYMOUS_VIEWER = "anonymous";
