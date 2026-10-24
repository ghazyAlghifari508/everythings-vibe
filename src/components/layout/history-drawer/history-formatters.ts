import { APP_TIME_ZONE } from "@/lib/constants";
import { resolveHistoryUrl } from "@/lib/flow-progress";
import type {
	DrawerHistoryItem,
	HistoryFailure,
	WireHistoryItem,
} from "./history-types";

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
const DAY_FORMAT = new Intl.DateTimeFormat("id-ID", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: APP_TIME_ZONE,
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_WINDOW_MS = 7 * DAY_MS;

export function classifyHistoryFailure(error: unknown): HistoryFailure {
	if (!(error instanceof Error)) return "server";
	if (error.message === "Unauthorized") return "session";
	if (error.message === "Forbidden") return "blocked";
	return "server";
}

export function toDrawerItems(items: WireHistoryItem[]): DrawerHistoryItem[] {
	return items.map((item) => ({
		id: item.id,
		name: item.name,
		type: "plan",
		updatedAt:
			item.updatedAt instanceof Date
				? item.updatedAt
				: new Date(item.updatedAt),
		url: resolveHistoryUrl({
			id: item.id,
			step: item.step,
			lastUrl: item.lastUrl,
		}),
		step: item.step,
		preview: item.preview,
		acStatus: item.acStatus,
		taskStatus: item.taskStatus,
	}));
}

export function formatRelativeTime(value: Date): string {
	const time = value.getTime();
	if (!Number.isFinite(time)) return "—";
	const diff = time - Date.now();
	if (Math.abs(diff) < HOUR_MS) {
		return RELATIVE_FORMAT.format(Math.round(diff / MINUTE_MS), "minute");
	}
	if (Math.abs(diff) < DAY_MS) {
		return RELATIVE_FORMAT.format(Math.round(diff / HOUR_MS), "hour");
	}
	if (Math.abs(diff) < RELATIVE_WINDOW_MS) {
		return RELATIVE_FORMAT.format(Math.round(diff / DAY_MS), "day");
	}
	return DAY_FORMAT.format(value);
}

// Stage alone does not prove generation completed; preview and statuses do.
export function describeStatus(item: DrawerHistoryItem): string {
	switch (item.step) {
		case "question":
			return "Tahap Pertanyaan";
		case "fitur":
			return "Tahap Fitur · Daftar fitur tersusun";
		case "prd":
			return item.preview
				? "Tahap PRD · Ringkasan tersimpan"
				: "Tahap PRD · Belum ada ringkasan";
		case "ac":
			return item.acStatus === "completed"
				? "Tahap AC · AC selesai"
				: "Tahap AC · AC belum selesai";
		case "task":
			return item.taskStatus === "completed"
				? "Tahap Task · Task selesai"
				: "Tahap Task · Task belum selesai";
		default:
			return "Proyek tersimpan";
	}
}
