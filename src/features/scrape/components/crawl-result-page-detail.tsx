import type { scrapePages } from "@/db/schema";
import { cn } from "@/lib/utils";
import { statusMark, statusText } from "./crawl-page-status";

type Page = typeof scrapePages.$inferSelect;

export function PageDetail({ page }: { page: Page }) {
	const content = page.content;
	const headingLevels =
		content?.headingLevels ??
		content?.headings.map((text) => ({ level: null as number | null, text })) ??
		[];
	const sections = content?.sections ?? [];
	const internalLinks = content?.internalLinks ?? [];
	const externalLinks = content?.externalLinks ?? [];
	const showSplit = Boolean(
		content && (content.internalLinks || content.externalLinks),
	);

	return (
		<div className="min-w-0">
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
						page.status === "completed"
							? "border-graphite text-mist"
							: page.status === "failed"
								? "border-crimson text-crimson"
								: "border-graphite text-fog",
					)}
				>
					<span aria-hidden>{statusMark(page.status)}</span>
					{statusText(page.status)}
				</span>
				{page.httpStatus ? (
					<span className="text-xs text-fog tabular-nums">
						HTTP {page.httpStatus}
					</span>
				) : null}
			</div>
			<h3 className="mt-3 break-words text-xl font-semibold text-snow">
				{page.title ?? "Halaman"}
			</h3>
			<p className="mt-2 break-all text-xs text-fog">{page.url}</p>

			{page.status === "queued" ? (
				<p className="mt-4 rounded-lg border border-graphite p-3 text-sm text-fog">
					Halaman ditemukan sebagai tautan tetapi belum dikunjungi dalam batas
					crawl.
				</p>
			) : null}
			{page.status === "skipped" ? (
				<p className="mt-4 rounded-lg border border-graphite p-3 text-sm text-fog">
					Halaman dilewati{page.error ? `: ${page.error}` : "."} Tidak ada
					konten yang diambil.
				</p>
			) : null}
			{page.status === "failed" && page.error ? (
				<p role="alert" className="mt-4 text-sm text-fog">
					{page.error}
				</p>
			) : null}

			{content ? (
				<>
					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Overview</h4>
						<p className="mt-2 text-sm leading-6 text-fog">
							{content.description ?? "Deskripsi tidak tersedia."}
						</p>
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Headings</h4>
						{headingLevels.length === 0 ? (
							<p className="mt-2 text-sm text-fog">
								Tidak ada heading teramati.
							</p>
						) : (
							<ul className="mt-2 space-y-1.5">
								{headingLevels.map((heading) => (
									<li
										key={`${heading.level}-${heading.text}`}
										className="flex gap-2 text-sm"
									>
										<span className="w-8 shrink-0 text-xs text-fog tabular-nums">
											{typeof heading.level === "number"
												? `H${heading.level}`
												: "H?"}
										</span>
										<span className="min-w-0 break-words text-snow">
											{heading.text}
										</span>
									</li>
								))}
							</ul>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Content</h4>
						{sections.length > 0 ? (
							<div className="mt-2 space-y-2">
								{sections.map((section, position) => (
									<details
										key={`${section.title}-${section.text.slice(0, 48)}`}
										open={position === 0}
										className="rounded-lg border border-graphite"
									>
										<summary className="cursor-pointer px-3 py-2 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo">
											{section.title ?? "(Tanpa judul)"}
										</summary>
										<div className="max-h-[300px] overflow-auto whitespace-pre-wrap px-3 pb-3 text-sm leading-6 text-snow">
											{section.text}
										</div>
									</details>
								))}
							</div>
						) : (
							<div className="mt-2 max-h-[600px] overflow-auto whitespace-pre-wrap text-sm leading-7 text-snow">
								{content.text}
							</div>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">Links</h4>
						{showSplit ? (
							<div className="mt-2 space-y-2">
								<details className="rounded-lg border border-graphite">
									<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
										Internal ({internalLinks.length})
									</summary>
									<LinkList links={internalLinks} />
								</details>
								<details className="rounded-lg border border-graphite">
									<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
										External ({externalLinks.length})
									</summary>
									<LinkList links={externalLinks} />
								</details>
							</div>
						) : content.links.length > 0 ? (
							<details className="mt-2 rounded-lg border border-graphite">
								<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
									Links ({content.links.length})
								</summary>
								<LinkList links={content.links} />
							</details>
						) : (
							<p className="mt-2 text-sm text-fog">
								Tidak ada tautan teramati.
							</p>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">
							Images ({content.images.length})
						</h4>
						{content.images.length === 0 ? (
							<p className="mt-2 text-sm text-fog">
								Tidak ada gambar teramati.
							</p>
						) : (
							<details className="mt-2 rounded-lg border border-graphite">
								<summary className="cursor-pointer px-3 py-2 text-sm text-snow">
									Lihat daftar gambar
								</summary>
								<ul className="space-y-2 px-3 pb-3">
									{content.images.slice(0, 20).map((image) => (
										<li key={image} className="break-all text-xs text-fog">
											{image}
										</li>
									))}
									{content.images.length > 20 ? (
										<li className="text-xs text-fog">
											+{content.images.length - 20} lainnya
										</li>
									) : null}
								</ul>
							</details>
						)}
					</section>

					<section className="mt-5">
						<h4 className="text-sm font-semibold text-snow">UI Elements</h4>
						<p className="mt-2 text-sm text-fog">
							{content.patterns.length > 0
								? content.patterns.join(" · ")
								: "Tidak ada pola teramati."}{" "}
							Elemen teramati, bukan klaim fungsionalitas produk.
						</p>
					</section>
				</>
			) : null}
		</div>
	);
}

function LinkList({ links }: { links: string[] }) {
	if (links.length === 0)
		return <p className="px-3 pb-3 text-sm text-fog">Tidak ada.</p>;
	return (
		<ul className="space-y-2 px-3 pb-3">
			{links.slice(0, 20).map((link) => (
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
			{links.length > 20 ? (
				<li className="text-xs text-fog">+{links.length - 20} lainnya</li>
			) : null}
		</ul>
	);
}
