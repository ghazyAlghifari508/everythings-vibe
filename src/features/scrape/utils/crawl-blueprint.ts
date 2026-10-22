import type { scrapePages } from "@/db/schema";
import { buildCrawlRelations } from "./crawl-relations";

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

export function buildWebsiteBlueprint(input: BuildBlueprintInput): string {
	const { pages, sourceUrl } = input;
	const domain = input.domain ?? safeDomain(sourceUrl);
	const completed = pages.filter((row) => row.status === "completed");
	const skipped = pages.filter((row) => row.status === "skipped");
	const failed = pages.filter((row) => row.status === "failed");
	const queued = pages.filter((row) => row.status === "queued");
	const lines: string[] = [];
	lines.push("# Website Blueprint");
	lines.push("");
	lines.push(`Source URL: ${sourceUrl}`);
	lines.push(`Domain: ${domain}`);
	if (input.capturedAt) lines.push(`Captured at: ${input.capturedAt}`);
	if (input.scope)
		lines.push(
			`Scope: max ${input.scope.maxPages} pages · depth ${input.scope.maxDepth}${input.scope.followSubdomains ? " · termasuk subdomain" : ""}${input.scope.urlRegex ? ` · filter: \`${input.scope.urlRegex}\`` : ""}`,
		);
	else lines.push("Scope: berdasarkan hasil tersimpan");
	lines.push("");
	lines.push("## Crawl Summary");
	lines.push("");
	lines.push(`- Ditemukan: ${pages.length}`);
	lines.push(`- Berhasil: ${completed.length}`);
	lines.push(`- Dilewati: ${skipped.length}`);
	lines.push(`- Gagal: ${failed.length}`);
	if (queued.length > 0) lines.push(`- Antre: ${queued.length}`);
	lines.push("");
	lines.push("## Coverage & Limitations");
	lines.push("");
	lines.push(
		"- Jumlah ditemukan adalah halaman yang teramati dalam batas crawl, bukan jumlah seluruh halaman website.",
	);
	if (input.scope)
		lines.push(
			`- Crawl dibatasi pada max ${input.scope.maxPages} halaman dan kedalaman ${input.scope.maxDepth} dari halaman awal.`,
		);
	else
		lines.push(
			"- Crawl dibatasi oleh pengaturan maxPages/maxDepth saat pengambilan.",
		);
	lines.push(
		"- robots.txt dihormati; halaman yang dibatasi dicatat sebagai dilewati.",
	);
	lines.push(
		"- Crawler membaca HTML statis tanpa eksekusi JavaScript; situs yang dirender dinamis mungkin tidak tercakup penuh.",
	);
	lines.push(
		"- Relasi orang-tua adalah tautan yang teramati, bukan alur pengguna yang disimpulkan.",
	);
	lines.push("");
	lines.push("## Verified Page Inventory");
	lines.push("");
	lines.push("| Status | Halaman | URL | HTTP | Kedalaman |");
	lines.push("| --- | --- | --- | --- | --- |");
	for (const row of pages) {
		lines.push(
			`| ${row.status} | ${escapeCell(pageLabel(row))} | ${escapeCell(row.url)} | ${row.httpStatus ?? "-"} | ${row.depth} |`,
		);
	}
	lines.push("");
	lines.push("## Observed Link Relationships");
	lines.push("");
	const relations = buildCrawlRelations(pages);
	const edges = [...relations.primaryEdges, ...relations.secondaryEdges];
	if (edges.length === 0)
		lines.push("Tidak ada relasi tautan teramati antar halaman tersimpan.");
	else for (const edge of edges) lines.push(`- ${edge.from} -> ${edge.to}`);
	lines.push("");
	lines.push("## Page Analysis");
	lines.push("");
	for (const row of pages) {
		lines.push(`### Page: ${escapeCell(pageLabel(row))}`);
		lines.push("");
		lines.push(`- URL: ${row.url}`);
		lines.push(`- Status: ${row.status}`);
		if (row.httpStatus !== null) lines.push(`- HTTP: ${row.httpStatus}`);
		lines.push(`- Parent: ${row.parentUrl ?? "Halaman awal"}`);
		lines.push(`- Depth: ${row.depth}`);
		if (row.error) lines.push(`- Error: ${escapeCell(row.error)}`);
		if (!row.content) {
			lines.push("- Konten: tidak tersedia untuk status ini.");
			lines.push("");
			continue;
		}
		const content = row.content;
		lines.push(
			`- Description: ${content.description ? escapeCell(content.description) : "Tidak tersedia"}`,
		);
		const levels =
			content.headingLevels ??
			content.headings.map((text) => ({ level: null as number | null, text }));
		if (levels.length > 0) {
			lines.push("- Heading hierarchy:");
			for (const heading of levels) {
				const prefix =
					typeof heading.level === "number" ? `H${heading.level}` : "H?";
				lines.push(`  - ${prefix}: ${escapeCell(heading.text)}`);
			}
		} else lines.push("- Heading hierarchy: tidak ada heading teramati.");
		const sections = content.sections ?? [];
		if (sections.length > 0) {
			lines.push("- Content sections:");
			for (const section of sections) {
				const title = section.title
					? escapeCell(section.title)
					: "(Tanpa judul)";
				lines.push(`  - ${title}: ${escapeCell(section.text).slice(0, 500)}`);
			}
		} else if (content.text)
			lines.push(`- Content: ${escapeCell(content.text).slice(0, 1000)}`);
		const internal = content.internalLinks ?? [];
		const external = content.externalLinks ?? [];
		if (content.internalLinks || content.externalLinks) {
			lines.push(`- Internal links (${internal.length})`);
			for (const link of internal.slice(0, 50)) lines.push(`  - ${link}`);
			lines.push(`- External links (${external.length})`);
			for (const link of external.slice(0, 50)) lines.push(`  - ${link}`);
		} else {
			lines.push(`- Links (${content.links.length})`);
			for (const link of content.links.slice(0, 50)) lines.push(`  - ${link}`);
		}
		if (content.images.length > 0) {
			lines.push(`- Images (${content.images.length})`);
			for (const image of content.images.slice(0, 50))
				lines.push(`  - ${image}`);
		} else lines.push("- Images: tidak ada");
		lines.push(
			`- Observed UI elements: ${content.patterns.length > 0 ? escapeCell(content.patterns.join(", ")) : "tidak ada"}`,
		);
		const outgoing = content.outgoingPages ?? [];
		if (outgoing.length > 0) {
			lines.push(`- Observed page links (${outgoing.length})`);
			for (const url of outgoing.slice(0, 50)) lines.push(`  - ${url}`);
		}
		lines.push("");
	}
	lines.push("## Failed & Skipped Pages");
	lines.push("");
	const problematic = [...failed, ...skipped];
	if (problematic.length === 0)
		lines.push("Tidak ada halaman gagal atau dilewati.");
	else
		for (const row of problematic)
			lines.push(
				`- ${row.status}: ${row.url} — ${row.error ? escapeCell(row.error) : "tanpa detail"}`,
			);
	lines.push("");
	lines.push("## Evidence & Interpretation Boundary");
	lines.push("");
	lines.push(
		"Dokumen ini berisi data crawl yang teramati. Relasi orang-tua mewakili tautan yang ditemukan, bukan perjalanan pengguna yang disimpulkan. Tidak ada klaim arsitektur AI yang disertakan.",
	);
	lines.push("");
	return `${lines.join("\n").trim()}\n`;
}

function safeDomain(sourceUrl: string): string {
	try {
		return new URL(sourceUrl).hostname.toLowerCase();
	} catch {
		return sourceUrl;
	}
}
