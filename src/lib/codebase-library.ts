import type { CodebaseAnalysis } from "./codebase-analysis";

export const NEW_REPOSITORY_HREF = "/plan/codebase";

export interface CodebaseLibraryItem {
	id: string;
	name: string;
	updatedAt: string | null;
	fileCount: number | null;
	snapshotCreatedAt: string | null;
	snapshotStatus: string | null;
	summary: string | null;
	framework: string | null;
	language: string | null;
	packageManager: string | null;
}

export interface LibraryAnalysisSlice {
	summary: string | null;
	framework: string | null;
	language: string | null;
	packageManager: string | null;
}

function normalizeAnalysisText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	if (trimmed === "Tidak terdeteksi") return null;
	return trimmed;
}

export function pickLibraryAnalysis(
	output: CodebaseAnalysis | null | undefined,
): LibraryAnalysisSlice {
	return {
		summary: normalizeAnalysisText(output?.summary),
		framework: normalizeAnalysisText(output?.framework),
		language: normalizeAnalysisText(output?.language),
		packageManager: normalizeAnalysisText(output?.packageManager),
	};
}

export function hasLibraryAnalysis(
	item: Pick<
		CodebaseLibraryItem,
		"summary" | "framework" | "language" | "packageManager"
	>,
): boolean {
	return Boolean(
		item.summary ?? item.framework ?? item.language ?? item.packageManager,
	);
}

export function mapLibraryStatus(
	snapshotStatus: string | null | undefined,
	hasReadyAnalysis: boolean,
): string {
	if (hasReadyAnalysis) return "Siap";
	switch (snapshotStatus) {
		case "ready":
			return "Siap";
		case "analyzing":
			return "Sedang dianalisis";
		case "uploading":
			return "Sedang disinkronkan";
		case "uploaded":
			return "Tersinkron";
		case "failed":
			return "Perlu perhatian";
		case "expired":
			return "Sesi berakhir";
		case null:
		case undefined:
			return "Belum ada sync";
		default:
			return "Status tidak dikenal";
	}
}

export function filterLibraryItems(
	items: readonly CodebaseLibraryItem[],
	query: string,
): CodebaseLibraryItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...items];
	return items.filter((item) => {
		const haystack = [
			item.name,
			item.summary ?? "",
			item.framework ?? "",
			item.language ?? "",
			item.packageManager ?? "",
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(q);
	});
}

export function getLibraryItemHref(
	item: Pick<CodebaseLibraryItem, "id">,
): string {
	return `/codebases/${item.id}`;
}
