import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { ScrapeImageResult } from "@/lib/services/scrape-service";

export type ImageResult = ScrapeImageResult;

function shortUrl(value: string, max = 48): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

export function ImagesResult({
	images,
	sourceUrl,
	imageOutcome,
}: {
	images: ImageResult[];
	sourceUrl: string;
	imageOutcome?: "complete" | "partial" | "empty" | "all-failed" | null;
}) {
	const [formatFilter, setFormatFilter] = useState("");
	const [kindFilter, setKindFilter] = useState("");
	const [downloading, setDownloading] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);
	const formats = [
		...new Set(images.flatMap((image) => (image.format ? [image.format] : []))),
	];
	const kinds = [
		...new Set(
			images.flatMap((image) =>
				image.classification ? [image.classification] : [],
			),
		),
	];
	const saved = images.filter((image) => image.status === "completed").length;
	const failed = images.filter((image) => image.status === "failed").length;
	const visible = images.filter(
		(image) =>
			image.status === "completed" &&
			(!formatFilter || image.format === formatFilter) &&
			(!kindFilter || image.classification === kindFilter),
	);
	const hasFilter = formatFilter !== "" || kindFilter !== "";
	async function download(image: ImageResult) {
		if (downloading) return;
		setDownloading(image.id);
		setNotice("");
		try {
			const response = await fetch(image.assetUrl);
			if (!response.ok) throw new Error("Download gagal.");
			const url = URL.createObjectURL(await response.blob());
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `image-${image.id}.${image.format ?? "bin"}`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			setNotice("Gambar gagal diunduh. Buka sumber asli atau coba lagi.");
		} finally {
			setDownloading(null);
		}
	}
	async function copySource(image: ImageResult) {
		try {
			await navigator.clipboard.writeText(image.url);
			setCopied(image.id);
			setTimeout(() => {
				setCopied((current) => (current === image.id ? null : current));
			}, 1500);
		} catch {
			setNotice("URL sumber gagal disalin.");
		}
	}
	const [notice, setNotice] = useState("");
	return (
		<section className="space-y-5" aria-label="Images Explorer">
			<header>
				<h2 className="text-2xl font-bold text-snow">Images Explorer</h2>
				<a
					href={sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-2 block max-w-full truncate font-mono text-xs text-fog"
					title={sourceUrl}
				>
					{sourceUrl}
				</a>
				<p className="mt-3 font-mono text-xs text-fog tabular-nums">
					{images.length} ditemukan · {saved} tersimpan · {failed} gagal
				</p>
				{imageOutcome === "partial" && (
					<p className="mt-2 text-sm text-fog">
						Sebagian gambar berhasil diambil. {saved} gambar tersedia. {failed}{" "}
						resource gagal diverifikasi.
					</p>
				)}
			</header>
			<div className="flex flex-wrap items-end gap-3">
				<label className="inline-flex flex-col gap-1.5 text-xs text-fog">
					Format
					<select
						value={formatFilter}
						onChange={(event) => setFormatFilter(event.target.value)}
						aria-label="Filter format"
						className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<option value="">Semua</option>
						{formats.map((format) => (
							<option key={format} value={format}>
								{format}
							</option>
						))}
					</select>
				</label>
				<label className="inline-flex flex-col gap-1.5 text-xs text-fog">
					Jenis
					<select
						value={kindFilter}
						onChange={(event) => setKindFilter(event.target.value)}
						aria-label="Filter jenis"
						className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<option value="">Semua</option>
						{kinds.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</select>
				</label>
				{hasFilter && (
					<button
						type="button"
						onClick={() => {
							setFormatFilter("");
							setKindFilter("");
						}}
						className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-fog underline underline-offset-4 hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Reset filter
					</button>
				)}
			</div>
			{notice && (
				<p role="alert" className="text-sm text-fog">
					{notice}
				</p>
			)}
			{failed > 0 && (
				<details className="text-sm text-fog">
					<summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo">
						{failed} gambar tidak dapat diambil
					</summary>
					<ul className="mt-3 space-y-2">
						{images
							.filter((image) => image.status === "failed")
							.map((image) => (
								<li key={image.id} className="min-w-0">
									<p className="truncate font-mono text-xs" title={image.url}>
										{shortUrl(image.url)}
									</p>
									{image.error ? (
										<p className="mt-1 font-mono text-xs">{image.error}</p>
									) : null}
								</li>
							))}
					</ul>
				</details>
			)}
			{visible.length ? (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{visible.map((image) => (
						<article
							key={image.id}
							className="min-w-0 overflow-hidden rounded-xl border border-graphite bg-charcoal"
						>
							<div className="flex h-52 items-center justify-center bg-onyx p-4">
								<img
									src={image.assetUrl}
									alt={image.evidence.alt ?? ""}
									loading="lazy"
									referrerPolicy="no-referrer"
									className="max-h-full max-w-full object-contain"
									onError={(event) => {
										event.currentTarget.alt = "Gambar tidak dapat dimuat";
									}}
								/>
							</div>
							<div className="space-y-3 p-3">
								<p className="text-xs text-fog">
									{image.format ?? "Format belum diketahui"}
									{image.width && image.height
										? ` · ${image.width} × ${image.height}`
										: ""}
									{image.classification ? ` · ${image.classification}` : ""}
								</p>
								<details className="min-w-0 text-xs text-fog">
									<summary
										className="cursor-pointer truncate focus-visible:ring-2 focus-visible:ring-indigo"
										title={image.url}
									>
										{shortUrl(image.url)}
									</summary>
									<p className="mt-1 break-all font-mono text-xs">
										{image.url}
									</p>
								</details>
								<div className="flex gap-2">
									<button
										disabled={downloading !== null}
										type="button"
										onClick={() => void download(image)}
										aria-label="Download gambar"
										title="Download gambar"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
									>
										<Download size={16} aria-hidden />
									</button>
									<a
										href={image.url}
										target="_blank"
										rel="noreferrer"
										aria-label="Buka gambar asli"
										title="Buka gambar asli"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
									>
										<ExternalLink size={16} aria-hidden />
									</a>
									<button
										type="button"
										onClick={() => void copySource(image)}
										aria-label="Salin URL sumber"
										title="Salin URL sumber"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
									>
										{copied === image.id ? (
											<Check size={16} aria-hidden />
										) : (
											<Copy size={16} aria-hidden />
										)}
									</button>
								</div>
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-xl border border-graphite bg-charcoal p-6">
					{images.length === 0 && imageOutcome === "empty" ? (
						<>
							<p className="text-sm font-semibold text-snow">
								Tidak ada gambar yang ditemukan
							</p>
							<p className="mt-1 text-sm text-fog">
								Halaman berhasil diperiksa, tetapi tidak ada gambar yang dapat
								diambil.
							</p>
						</>
					) : images.length > 0 && saved === 0 ? (
						<>
							<p className="text-sm font-semibold text-snow">
								Gambar belum dapat diperiksa
							</p>
							<p className="mt-1 text-sm text-fog">
								Akses ke website gagal sebelum proses pemeriksaan gambar
								selesai.
							</p>
						</>
					) : (
						<p className="text-sm text-fog">
							{images.length
								? "Tidak ada gambar yang sesuai filter."
								: "Tidak ditemukan resource gambar yang dapat diambil dari halaman ini."}
						</p>
					)}
				</div>
			)}
		</section>
	);
}
