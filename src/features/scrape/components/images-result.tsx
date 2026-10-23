import { useEffect, useState } from "react";
import {
	imageCountsLabel,
	imageResultCounts,
} from "@/features/scrape/utils/scrape-images";
import {
	diagnosticLabels,
	type ImageResult,
	readAssetFailure,
	refreshImageUrl,
} from "./images-result-asset";
import { ImageCard, shortUrl } from "./images-result-card";
import { ScrapeFilterSelect } from "./scrape-filter-select";

export type { ImageResult };

export function ImagesResult({
	images,
	sourceUrl,
	imageOutcome,
	discoveredImages,
}: {
	images: ImageResult[];
	sourceUrl: string;
	imageOutcome?: "complete" | "partial" | "empty" | "all-failed" | null;
	discoveredImages?: number;
}) {
	const [formatFilter, setFormatFilter] = useState("");
	const [kindFilter, setKindFilter] = useState("");
	const [downloading, setDownloading] = useState<string | null>(null);
	const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
	const [downloadFailures, setDownloadFailures] = useState<
		Record<string, Awaited<ReturnType<typeof readAssetFailure>>>
	>({});
	const [notice, setNotice] = useState("");
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (
			!Object.values(downloadFailures).some(
				(failure) => failure.retryAt > Date.now(),
			)
		)
			return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [downloadFailures]);
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
	const counts = imageResultCounts(images, discoveredImages);
	const saved = counts.verified;
	const failed = images.filter((image) => image.status === "failed").length;
	const visible = images.filter(
		(image) =>
			image.status === "completed" &&
			(!formatFilter || image.format === formatFilter) &&
			(!kindFilter || image.classification === kindFilter),
	);
	const hasFilter = formatFilter !== "" || kindFilter !== "";
	const gallerySummary = hasFilter
		? `Menampilkan ${visible.length} dari ${counts.verified} gambar`
		: `${counts.verified} gambar tersedia`;
	async function download(image: ImageResult) {
		if (downloading || (downloadFailures[image.id]?.retryAt ?? 0) > Date.now())
			return;
		setDownloading(image.id);
		setNotice("");
		try {
			let url = assetUrls[image.id] ?? image.assetUrl;
			if (
				["CAPABILITY_EXPIRED", "CAPABILITY_INVALID"].includes(
					downloadFailures[image.id]?.code ?? "",
				)
			) {
				url = await refreshImageUrl(image);
				setAssetUrls((current) => ({ ...current, [image.id]: url }));
			}
			const response = await fetch(url);
			if (!response.ok) {
				const failure = await readAssetFailure(response);
				setDownloadFailures((current) => ({ ...current, [image.id]: failure }));
				setNotice(
					`${diagnosticLabels[failure.code] ?? `Download gagal (${failure.code}).`}${failure.retryAt > Date.now() ? ` Coba lagi setelah ${Math.ceil((failure.retryAt - Date.now()) / 1000)} dtk.` : ""}`,
				);
				return;
			}
			const blobUrl = URL.createObjectURL(await response.blob());
			const anchor = document.createElement("a");
			anchor.href = blobUrl;
			anchor.download = `image-${image.id}.${image.format ?? "bin"}`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
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
	return (
		<section className="space-y-5" aria-label="Images Explorer">
			<header>
				<h2 className="text-2xl font-bold text-snow">Images Explorer</h2>
				<p className="mt-2 text-sm font-medium text-snow tabular-nums">
					{gallerySummary}
				</p>
				<a
					href={sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-2 block max-w-full truncate font-mono text-xs text-fog"
					title={sourceUrl}
				>
					{sourceUrl}
				</a>
				<p className="mt-1 font-mono text-xs text-fog tabular-nums">
					{imageCountsLabel(counts)}
				</p>
				{imageOutcome === "partial" && (
					<p className="mt-2 text-sm text-fog">
						Sebagian gambar berhasil diambil. {saved} gambar terverifikasi.{" "}
						{failed} resource gagal diverifikasi.
					</p>
				)}
			</header>
			{/* The gallery exposes no reliable image names, so a query would only
			    match raw source URLs. Reintroduce a search field once images carry
			    searchable names the user can recognise. */}
			<div className="flex flex-wrap items-end gap-3">
				<ScrapeFilterSelect
					label="Format"
					className="w-36 sm:w-40"
					value={formatFilter}
					onChange={setFormatFilter}
					options={[
						{ value: "", label: "Semua" },
						...formats.map((format) => ({ value: format, label: format })),
					]}
				/>
				<ScrapeFilterSelect
					label="Jenis"
					className="w-36 sm:w-40"
					value={kindFilter}
					onChange={setKindFilter}
					options={[
						{ value: "", label: "Semua" },
						...kinds.map((type) => ({ value: type, label: type })),
					]}
				/>
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
						<ImageCard
							key={image.id}
							image={image}
							src={assetUrls[image.id] ?? image.assetUrl}
							downloadDisabled={
								downloading !== null ||
								(downloadFailures[image.id]?.retryAt ?? 0) > now
							}
							copied={copied === image.id}
							onRefresh={(url) =>
								setAssetUrls((current) => ({ ...current, [image.id]: url }))
							}
							onDownload={() => void download(image)}
							onCopy={() => void copySource(image)}
						/>
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
					) : images.length > 0 && saved === 0 && counts.pending === 0 ? (
						<>
							<p className="text-sm font-semibold text-snow">
								Semua gambar gagal diambil
							</p>
							<p className="mt-1 text-sm text-fog">
								Tidak ada byte gambar yang tersedia dari ekstraksi ini. Periksa
								alasan kegagalan di atas.
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
