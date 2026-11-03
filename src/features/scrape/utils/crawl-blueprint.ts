import type { scrapePages } from "@/db/schema";
import { CRAWL_BLUEPRINT_LIST_MAX_ITEMS } from "@/features/scrape/types/scrape-constants";
import { deriveCoverage } from "./crawl-blueprint-coverage";
import {
	type BlueprintNavigation,
	deriveSharedNavigation,
} from "./crawl-blueprint-nav";
import {
	type PageDetailCleanup,
	renderPageDetails,
} from "./crawl-blueprint-page-details";
import {
	derivePagePatterns,
	deriveSharedElements,
} from "./crawl-blueprint-patterns";
import { buildCrawlRelations, shortCrawlLabel } from "./crawl-relations";

type Page = typeof scrapePages.$inferSelect;

export interface BlueprintScope {
	maxPages: number;
	maxDepth: number;
	followSubdomains?: boolean;
	urlRegex?: string;
}

export interface BuildBlueprintInput {
	pages: Page[];
	sourceUrl: string;
	scope?: BlueprintScope;
	capturedAt?: string;
	domain?: string;
}

function escapeCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function pageLabel(row: Page): string {
	return row.title?.trim() ? row.title.trim() : row.url;
}

function safeDomain(sourceUrl: string): string {
	try {
		return new URL(sourceUrl).hostname.toLowerCase();
	} catch {
		return sourceUrl;
	}
}

function overview(
	input: BuildBlueprintInput,
	domain: string,
	lines: string[],
): void {
	lines.push("## Website Overview");
	lines.push("");
	lines.push(`- Source URL: ${input.sourceUrl}`);
	lines.push(`- Domain: ${domain}`);
	if (input.capturedAt) lines.push(`- Captured at: ${input.capturedAt}`);
	if (input.scope)
		lines.push(
			`- Scope: max ${input.scope.maxPages} halaman · kedalaman ${input.scope.maxDepth}${input.scope.followSubdomains ? " · termasuk subdomain" : ""}${input.scope.urlRegex ? ` · filter: \`${input.scope.urlRegex}\`` : ""}`,
		);
	else lines.push("- Scope: berdasarkan hasil tersimpan");

	const coverage = deriveCoverage(input.pages, input.scope);
	lines.push("");
	lines.push("### Crawl Summary");
	lines.push("");
	lines.push(`- Ditemukan: ${coverage.discovered}`);
	lines.push(`- Berhasil: ${coverage.completed}`);
	lines.push(`- Dilewati: ${coverage.skipped}`);
	lines.push(`- Gagal: ${coverage.failed}`);
	if (coverage.queued > 0) lines.push(`- Antre: ${coverage.queued}`);
	lines.push("");
}

function informationArchitecture(
	pages: Page[],
	lines: string[],
	shared: BlueprintNavigation,
): void {
	lines.push("## Information Architecture");
	lines.push("");
	lines.push("### Page Inventory");
	lines.push("");
	lines.push("| Status | Halaman | URL | HTTP | Kedalaman |");
	lines.push("| --- | --- | --- | --- | --- |");
	for (const row of pages)
		lines.push(
			`| ${row.status} | ${escapeCell(pageLabel(row))} | ${escapeCell(row.url)} | ${row.httpStatus ?? "-"} | ${row.depth} |`,
		);
	lines.push("");

	const relations = buildCrawlRelations(pages);
	lines.push("### Hierarchical Relationships");
	lines.push("");
	if (relations.primaryEdges.length === 0)
		lines.push("Tidak ada relasi induk-anak teramati antar halaman tersimpan.");
	else
		for (const edge of relations.primaryEdges)
			lines.push(
				`- ${escapeCell(shortCrawlLabel(pageByUrl(pages, edge.from)?.title ?? null, edge.from))} -> ${escapeCell(shortCrawlLabel(pageByUrl(pages, edge.to)?.title ?? null, edge.to))}`,
			);
	lines.push("");

	lines.push("### Shared Navigation");
	lines.push("");
	if (shared.shared.length === 0) {
		lines.push(
			shared.linkSources.length < 2
				? "Navigasi bersama tidak dapat ditetapkan: kurang dari dua halaman membawa data tautan."
				: "Tidak ada tautan yang muncul di semua halaman pembawa data tautan.",
		);
	} else {
		lines.push(
			`Tautan berikut teramati pada ${shared.linkSources.length} halaman yang membawa data tautan. Sumber elemen (navbar, footer, sidebar) tidak dicatat oleh crawler, jadi kelompok ini adalah tautan berulang, bukan spesifikasi komponen navigasi.`,
		);
		lines.push("");
		for (const target of shared.shared)
			lines.push(`- ${escapeCell(target.label)} — ${target.url}`);
	}
	lines.push("");

	lines.push("#### Page-Specific Links");
	lines.push("");
	if (shared.pageSpecific.length === 0)
		lines.push("Tidak ada tautan khusus halaman di luar navigasi bersama.");
	else
		for (const edge of shared.pageSpecific)
			lines.push(`- ${edge.from} -> ${edge.to}`);
	lines.push("");
}

function pageByUrl(pages: Page[], url: string): Page | undefined {
	return pages.find((row) => row.url === url);
}

function pagePatterns(pages: Page[], lines: string[]): void {
	const patterns = derivePagePatterns(pages);
	lines.push("## Page Templates / Patterns");
	lines.push("");
	if (patterns.length === 0) {
		lines.push(
			"Tidak ada pola halaman yang dapat dibuktikan dari data crawl. Tidak ada template yang ditebak.",
		);
		lines.push("");
		return;
	}
	lines.push(
		"Pola di bawah berasal dari kesamaan struktur heading antar halaman. Ini bukti kerangka layout, bukan klaim komponen reusable.",
	);
	lines.push("");
	for (const pattern of patterns) {
		lines.push(
			`- Struktur heading \`${pattern.signature}\` pada ${pattern.pages.length} halaman${pattern.identicalHeadingText ? " dengan teks heading identik" : ""}:`,
		);
		for (const url of pattern.pages)
			lines.push(
				`  - ${escapeCell(shortCrawlLabel(pageByUrl(pages, url)?.title ?? null, url))} — ${url}`,
			);
	}
	lines.push("");
}

function sharedElements(pages: Page[], lines: string[]): void {
	const evidence = deriveSharedElements(pages);
	lines.push("## Shared Elements");
	lines.push("");
	if (evidence.length === 0) {
		lines.push(
			"Tidak ada elemen HTML bersama yang teramati pada lebih dari satu halaman.",
		);
		lines.push("");
		return;
	}
	lines.push(
		"Elemen berikut teramati pada lebih dari satu halaman. Crawler mencatat keberadaan tag, bukan isi di dalamnya.",
	);
	lines.push("");
	for (const item of evidence) {
		lines.push(`### ${item.tag}`);
		lines.push("");
		lines.push(`- Teramati pada ${item.pages.length} halaman:`);
		for (const url of item.pages.slice(0, CRAWL_BLUEPRINT_LIST_MAX_ITEMS))
			lines.push(`  - ${url}`);
		lines.push("");
	}
}

function coverageSection(
	pages: Page[],
	scope: BlueprintScope | undefined,
	cleanup: PageDetailCleanup,
	lines: string[],
): void {
	const coverage = deriveCoverage(pages, scope);
	lines.push("## Crawl Coverage");
	lines.push("");
	lines.push(
		`- Halaman teramati: ${coverage.discovered} (berhasil ${coverage.completed}, dilewati ${coverage.skipped}, gagal ${coverage.failed}).`,
	);
	if (coverage.minDepth !== null && coverage.maxDepth !== null)
		lines.push(
			`- Kedalaman teramati: ${coverage.minDepth}–${coverage.maxDepth}.`,
		);
	if (scope) {
		lines.push(
			`- Batas crawl: max ${scope.maxPages} halaman, kedalaman ${scope.maxDepth}.`,
		);
		if (coverage.stoppedByPageLimit)
			lines.push(
				"- Batas jumlah halaman tercapai sebelum batas kedalaman, jadi tautan lebih dalam tidak diikuti. Hasil ini bukan analisis seluruh website.",
			);
		else if (coverage.depthLimitReached)
			lines.push("- Batas kedalaman tercapai selama crawl.");
	} else
		lines.push(
			"- Batas crawl tidak tersedia pada hasil tersimpan; angka di atas mencerminkan halaman yang tersimpan saja.",
		);
	lines.push(
		"- Halaman yang dibatasi crawler dicatat sebagai dilewati; kegagalan jaringan dicatat sebagai gagal.",
	);
	if (cleanup.removedHeadingDuplicates > 0)
		lines.push(
			`- Duplikat heading ekstraksi yang terbukti berurutan dibuang: ${cleanup.removedHeadingDuplicates}. Heading yang sama namun berjauh tetap dipertahankan.`,
		);
	if (cleanup.removedDecorativeRuns > 0)
		lines.push(
			`- Rangkaian angka dekoratif (counter/animasi) dibuang dari ringkasan section: ${cleanup.removedDecorativeRuns}.`,
		);
	lines.push("");

	const problematic = pages.filter(
		(row) => row.status === "failed" || row.status === "skipped",
	);
	lines.push("### Failed & Skipped Pages");
	lines.push("");
	if (problematic.length === 0)
		lines.push("Tidak ada halaman gagal atau dilewati.");
	else
		for (const row of problematic)
			lines.push(
				`- ${row.status}: ${row.url} — ${row.error ? escapeCell(row.error) : "tanpa detail"}`,
			);
	lines.push("");
}

function rawEvidence(pages: Page[], lines: string[]): void {
	lines.push("## Raw Evidence Appendix");
	lines.push("");
	lines.push(
		"Daftar lengkap apa yang teramati pada setiap halaman, sebelum pengelompokan. Bagian ini disimpan untuk penelusuran; bagian di atas adalah ringkasan yang sudah dikelompokkan.",
	);
	lines.push("");
	for (const row of pages) {
		lines.push(`### ${escapeCell(pageLabel(row))}`);
		lines.push("");
		lines.push(`- URL: ${row.url}`);
		lines.push(`- Status: ${row.status}`);
		if (row.httpStatus !== null) lines.push(`- HTTP: ${row.httpStatus}`);
		lines.push(`- Parent: ${row.parentUrl ?? "Halaman awal"}`);
		lines.push(`- Depth: ${row.depth}`);
		if (row.error) lines.push(`- Error: ${escapeCell(row.error)}`);
		const content = row.content;
		if (!content) {
			lines.push("- Konten: tidak tersedia untuk status ini.");
			lines.push("");
			continue;
		}
		const outgoing = content.outgoingPages ?? content.links;
		lines.push(`- Outgoing pages (${outgoing.length})`);
		for (const url of outgoing) lines.push(`  - ${url}`);
		const external = content.externalLinks ?? [];
		lines.push(`- External links (${external.length})`);
		for (const url of external) lines.push(`  - ${url}`);
		lines.push(`- Images (${content.images.length})`);
		for (const image of content.images) lines.push(`  - ${image}`);
		lines.push(
			`- Observed HTML elements: ${content.patterns.length > 0 ? escapeCell(content.patterns.join(", ")) : "tidak ada"}`,
		);
		lines.push(
			`- Description: ${content.description ? escapeCell(content.description) : "tidak tersedia"}`,
		);
		lines.push("");
	}
}

export function buildWebsiteBlueprint(input: BuildBlueprintInput): string {
	const domain = input.domain ?? safeDomain(input.sourceUrl);
	const shared = deriveSharedNavigation(input.pages);
	const cleanup: PageDetailCleanup = {
		removedHeadingDuplicates: 0,
		removedDecorativeRuns: 0,
	};
	const lines: string[] = [];
	lines.push("# Website Blueprint");
	lines.push("");
	overview(input, domain, lines);
	informationArchitecture(input.pages, lines, shared);
	pagePatterns(input.pages, lines);

	lines.push("## Page Details");
	lines.push("");
	const crawledUrls = new Set(
		input.pages
			.filter((row) => row.status === "completed")
			.map((row) => row.url),
	);
	for (const row of input.pages)
		lines.push(...renderPageDetails(row, crawledUrls, cleanup));

	sharedElements(input.pages, lines);
	coverageSection(input.pages, input.scope, cleanup, lines);
	rawEvidence(input.pages, lines);

	lines.push("## Evidence & Interpretation Boundary");
	lines.push("");
	lines.push(
		"Dokumen ini berisi data crawl yang teramati. Relasi induk-anak mewakili tautan yang ditemukan, bukan perjalanan pengguna yang disimpulkan. Pola halaman hanya ditulis ketika struktur heading benar-benar sama. Tidak ada klaim arsitektur atau komponen yang disertakan.",
	);
	lines.push("");
	return `${lines.join("\n").trim()}\n`;
}
