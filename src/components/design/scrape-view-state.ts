import type { ScrapeMode, ScrapeStatus } from "@/db/schema";

export type ScrapeViewKind = "result-design" | "result-html" | "progress";

export interface ScrapeViewInput {
	status: ScrapeStatus | string;
	mode: ScrapeMode | string;
	previewHtml: string;
	designMd: string;
}

export function resolveScrapeContentWidth(
	view: ScrapeViewKind,
): "wide" | "bounded" {
	return view === "progress" ? "bounded" : "wide";
}

export function resolveScrapeView(input: ScrapeViewInput): ScrapeViewKind {
	const hasContent =
		input.mode === "html"
			? input.previewHtml.length > 0
			: input.designMd.length > 0;
	if (input.status !== "completed" || !hasContent) return "progress";
	return input.mode === "html" ? "result-html" : "result-design";
}
