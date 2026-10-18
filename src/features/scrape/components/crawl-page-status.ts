import type { scrapePages } from "@/db/schema";

type Page = typeof scrapePages.$inferSelect;

export function statusMark(status: Page["status"]): string {
	if (status === "completed") return "✓";
	if (status === "failed") return "!";
	if (status === "skipped") return "⊘";
	return "○";
}

export function statusText(status: Page["status"]): string {
	if (status === "completed") return "Berhasil";
	if (status === "failed") return "Gagal";
	if (status === "skipped") return "Dilewati";
	return "Antre";
}
