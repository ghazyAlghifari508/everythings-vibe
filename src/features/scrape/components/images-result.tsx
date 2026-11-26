import { ArrowDown01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
export const LOAD_MORE_BATCH_SIZE = 12;
export const PAGE_SIZE = LOAD_MORE_BATCH_SIZE;

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
	const [visibleLimit, setVisibleLimit] = useState(LOAD_MORE_BATCH_SIZE);
	const [prevSourceUrl, setPrevSourceUrl] = useState(sourceUrl);

	if (sourceUrl !== prevSourceUrl) {
		setPrevSourceUrl(sourceUrl);
		setVisibleLimit(LOAD_MORE_BATCH_SIZE);
		setFormatFilter("");
		setKindFilter("");
	}
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

	const displayedImages = visible.slice(0, visibleLimit);
	const displayedCount = displayedImages.length;
	const totalCount = visible.length;
	const remainingCount = Math.max(0, totalCount - displayedCount);
	const nextBatchCount = Math.min(LOAD_MORE_BATCH_SIZE, remainingCount);
	const hasMore = remainingCount > 0;
	const progressPct =
		totalCount > 0 ? Math.round((displayedCount / totalCount) * 100) : 0;

	function handleLoadMore() {
		setVisibleLimit((current) => current + LOAD_MORE_BATCH_SIZE);
	}

	function handleFormatFilterChange(format: string) {
		setFormatFilter(format);
		setVisibleLimit(LOAD_MORE_BATCH_SIZE);
	}

	function handleKindFilterChange(kind: string) {
		setKindFilter(kind);
		setVisibleLimit(LOAD_MORE_BATCH_SIZE);
	}

	function handleResetFilter() {
		setFormatFilter("");
		setKindFilter("");
		setVisibleLimit(LOAD_MORE_BATCH_SIZE);
	}
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
				<div className="flex flex-wrap items-end justify-between gap-3 scroll-mt-6">
					<p className="text-sm font-medium text-snow tabular-nums">
						{gallerySummary}
					</p>

					<div className="flex flex-wrap items-end gap-3">
						{formats.length > 0 && (
							<ScrapeFilterSelect
								label="Format"
								className="w-36 sm:w-40"
								value={formatFilter}
								onChange={handleFormatFilterChange}
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
								onChange={handleKindFilterChange}
								options={[
									{ value: "", label: "Semua" },
									...kinds.map((type) => ({ value: type, label: type })),
								]}
							/>
						)}
						{hasFilter && (
							<button
								type="button"
								onClick={handleResetFilter}
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
				<>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{displayedImages.map((image) => (
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

					{totalCount > LOAD_MORE_BATCH_SIZE && (
						<div className="flex flex-col items-center justify-center gap-3 border-t border-graphite/40 pt-6">
							<p className="font-mono text-xs text-fog tabular-nums">
								Menampilkan {displayedCount} dari {totalCount} gambar
							</p>
							<div
								role="progressbar"
								aria-valuenow={displayedCount}
								aria-valuemin={0}
								aria-valuemax={totalCount}
								aria-label="Progres tampilan gambar"
								className="h-1.5 w-48 max-w-full overflow-hidden rounded-full bg-graphite/40"
							>
								<div
									className="h-full bg-indigo transition-all duration-300"
									style={{ width: `${progressPct}%` }}
								/>
							</div>
							{hasMore && (
								<Button
									type="button"
									variant="outline"
									onClick={handleLoadMore}
									className="min-h-11 gap-2 px-5"
								>
									<span>Tampilkan {nextBatchCount} gambar lagi</span>
									<Icon icon={ArrowDown01Icon} size={16} aria-hidden />
								</Button>
							)}
						</div>
					)}
				</>
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
