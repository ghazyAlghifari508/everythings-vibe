import { Download } from "lucide-react";
import { useState } from "react";
import type { scrapePages } from "@/db/schema";

type Page = typeof scrapePages.$inferSelect;

export function CrawlResult({
	pages,
	sourceUrl,
}: {
	pages: Page[];
	sourceUrl: string;
}) {
	const [selected, setSelected] = useState(pages[0]?.id ?? "");
	const page = pages.find((row) => row.id === selected);
	function download() {
		const markdown = [
			`# Website Blueprint`,
			`Source: ${sourceUrl}`,
			"",
			"## Verified page inventory",
			...pages.flatMap((row) => [
				`### ${row.title ?? row.url}`,
				`URL: ${row.url}`,
				`Status: ${row.status}`,
				`Observed parent link: ${row.parentUrl ?? "Starting page"}`,
				`Depth: ${row.depth}`,
				...(row.content
					? [
							`Description: ${row.content.description ?? "Not available"}`,
							`Headings: ${row.content.headings.join("; ")}`,
							`Observed UI elements: ${row.content.patterns.join(", ")}`,
							"",
							row.content.text,
							"",
							...row.content.links.map((link) => `- Link: ${link}`),
							...row.content.images.map((image) => `- Image: ${image}`),
						]
					: [`Error: ${row.error ?? "Not available"}`]),
				"",
			]),
			"## Interpretation boundary",
			"This document contains observed crawl data. Parent relationships represent discovered links, not inferred user journeys. No AI architecture claims are included.",
		].join("\n");
		const url = URL.createObjectURL(
			new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "website-blueprint.md";
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	return (
		<section className="space-y-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold text-snow">
						Website Blueprint
					</h1>
					<a
						href={sourceUrl}
						target="_blank"
						rel="noreferrer"
						className="mt-2 block break-all text-sm text-fog"
					>
						{sourceUrl}
					</a>
				</div>
				<button
					type="button"
					onClick={download}
					className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite px-4 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Download size={16} aria-hidden />
					Download blueprint
				</button>
			</header>
			<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<div className="min-w-0 space-y-6">
					<section>
						<h2 className="mb-3 text-lg font-semibold text-snow">
							Page Inventory
						</h2>
						<ul className="divide-y divide-graphite rounded-lg border border-graphite">
							{pages.map((row) => (
								<li key={row.id}>
									<button
										type="button"
										onClick={() => setSelected(row.id)}
										aria-pressed={selected === row.id}
										className={`w-full p-3 text-left focus-visible:ring-2 focus-visible:ring-indigo ${selected === row.id ? "bg-charcoal" : "hover:bg-onyx"}`}
									>
										<span className="block text-sm font-medium text-snow">
											{row.title ?? row.url}
										</span>
										<span className="mt-1 block break-all text-xs text-fog">
											{row.url}
										</span>
										<span className="mt-1 block text-xs text-fog">
											{row.status}
											{row.httpStatus ? ` · HTTP ${row.httpStatus}` : ""}
										</span>
									</button>
								</li>
							))}
						</ul>
					</section>
					<section>
						<h2 className="mb-3 text-lg font-semibold text-snow">
							Visual Sitemap
						</h2>
						<ul className="space-y-2 border-l border-graphite pl-3">
							{pages.map((row) => (
								<li
									key={row.id}
									className="text-sm text-fog"
									style={{ paddingLeft: `${row.depth * 12}px` }}
								>
									<button
										type="button"
										onClick={() => setSelected(row.id)}
										className="text-left hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
									>
										{row.title ?? new URL(row.url).pathname}
									</button>
									{row.parentUrl && (
										<span className="block break-all text-xs">
											Link dari {row.parentUrl}
										</span>
									)}
								</li>
							))}
						</ul>
					</section>
				</div>
				<section className="min-w-0 rounded-lg border border-graphite p-5">
					<h2 className="text-lg font-semibold text-snow">Page Explorer</h2>
					{page ? (
						<>
							<h3 className="mt-4 text-xl font-semibold text-snow">
								{page.title ?? "Halaman"}
							</h3>
							<p className="mt-2 break-all text-xs text-fog">{page.url}</p>
							{page.error && (
								<p role="alert" className="mt-4 text-sm text-fog">
									{page.error}
								</p>
							)}
							{page.content && (
								<>
									<p className="mt-4 text-sm text-fog">
										{page.content.description}
									</p>
									<div className="mt-4 max-h-[600px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-snow">
										{page.content.text}
									</div>
									{page.content.links.length > 0 && (
										<details className="mt-5">
											<summary className="text-sm text-snow">
												Links ({page.content.links.length})
											</summary>
											<ul className="mt-2 space-y-2">
												{page.content.links.map((link) => (
													<li key={link}>
														<a
															href={link}
															target="_blank"
															rel="noreferrer"
															className="break-all text-xs text-fog underline"
														>
															{link}
														</a>
													</li>
												))}
											</ul>
										</details>
									)}
								</>
							)}
						</>
					) : (
						<p className="mt-4 text-sm text-fog">
							Belum ada halaman yang berhasil diproses.
						</p>
					)}
				</section>
			</div>
		</section>
	);
}
