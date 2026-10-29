import { LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { imageResultCounts } from "@/features/scrape/utils/scrape-images";
import { extractHost } from "../utils/scrape-image-failures";
import { ImagesFailureSummary } from "./images-failure-summary";
import {
	diagnosticLabels,
	type ImageResult,
	readAssetFailure,
	refreshImageUrl,
} from "./images-result-asset";
import { ImageCard } from "./images-result-card";
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
	const savedImages = images.filter((image) => image.status === "completed");
	const failedImages = images.filter((image) => image.status === "failed");
	// Filter options come from the saved gallery only, so a filter can never
	// offer a value that matches zero cards.
	const formats = [
		...new Set(
			savedImages.flatMap((image) => (image.format ? [image.format] : [])),
		),
	];
	const kinds = [
		...new Set(
			savedImages.flatMap((image) =>
				image.classification ? [image.classification] : [],
			),
		),
	];
	const counts = imageResultCounts(images, discoveredImages);
	const saved = counts.verified;
	const visible = savedImages.filter(
		(image) =>
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
	const hostName = extractHost(sourceUrl);

	const failed = failedImages.length;

	return (
		<section className="space-y-6" aria-label="Images Explorer">
			<header className="space-y-1">
				<h2 className="text-xl font-bold tracking-tight text-snow sm:text-2xl">
					Hasil pengambilan gambar
				</h2>
				<a
					href={sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 font-mono text-xs text-fog transition-colors hover:text-snow"
					title={sourceUrl}
				>
					<span>{hostName}</span>
					<Icon
						icon={LinkSquare01Icon}
						size={12}
						aria-hidden
						className="shrink-0"
					/>
				</a>
			</header>

			{saved > 0 && (
				<div className="flex flex-wrap items-end justify-between gap-3">
					<p className="text-sm font-medium text-snow tabular-nums">
						{gallerySummary}
					</p>

					<div className="flex flex-wrap items-end gap-3">
						{formats.length > 0 && (
							<ScrapeFilterSelect
								label="Format"
								className="w-36 sm:w-40"
								value={formatFilter}
								onChange={setFormatFilter}
								options={[
									{ value: "", label: "Semua" },
									...formats.map((format) => ({
										value: format,
										label: format,
									})),
								]}
							/>
						)}
						{kinds.length > 0 && (
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
						)}
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
				</div>
			)}

			{failed > 0 && (
				<ImagesFailureSummary
					failedImages={failedImages}
					variant={saved > 0 ? "notice" : "empty"}
					discoveredCount={counts.discovered}
					savedCount={saved}
				/>
			)}

			{notice && (
				<p role="alert" className="text-sm text-fog">
					{notice}
				</p>
			)}

			{visible.length > 0 ? (
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
			) : images.length === 0 ? (
				<div className="rounded-xl border border-graphite bg-charcoal p-6">
					{imageOutcome === "empty" ? (
						<>
							<p className="text-sm font-semibold text-snow">
								Tidak ada gambar yang ditemukan
							</p>
							<p className="mt-1 text-sm text-fog">
								Halaman berhasil diperiksa, tetapi tidak ada gambar yang dapat
								diambil.
							</p>
						</>
					) : (
						<p className="text-sm text-fog">
							Tidak ditemukan resource gambar yang dapat diambil dari halaman
							ini.
						</p>
					)}
				</div>
			) : saved > 0 ? (
				<div className="rounded-xl border border-graphite bg-charcoal p-6">
					<p className="text-sm text-fog">
						Tidak ada gambar yang sesuai filter.
					</p>
				</div>
			) : null}
		</section>
	);
}
