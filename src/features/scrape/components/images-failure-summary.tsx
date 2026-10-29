import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	Copy01Icon,
	LinkSquare01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { ImageResult } from "@/features/scrape/components/images-result-asset";
import { shortUrl } from "@/features/scrape/components/images-result-card";
import {
	extractHost,
	groupImageFailures,
} from "@/features/scrape/utils/scrape-image-failures";
import { cn } from "@/lib/utils";

export interface ImagesFailureSummaryProps {
	failedImages: ImageResult[];
	/**
	 * `empty` is the single all-failed state and owns the counters. `notice` is
	 * the one-line partial-failure hint shown above a gallery that still works.
	 */
	variant: "notice" | "empty";
	discoveredCount: number;
	savedCount: number;
	className?: string;
}

export function ImagesFailureSummary({
	failedImages,
	variant,
	discoveredCount,
	savedCount,
	className,
}: ImagesFailureSummaryProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

	if (failedImages.length === 0) return null;

	const groups = groupImageFailures(failedImages);
	const detailId =
		variant === "empty"
			? "all-failed-images-detail"
			: "partial-failed-images-detail";

	async function copyUrl(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			setCopiedUrl(url);
			setTimeout(() => {
				setCopiedUrl((current) => (current === url ? null : current));
			}, 1500);
		} catch {
			// Clipboard write fallback
		}
	}

	const toggleLabel =
		variant === "empty" ? "Lihat rincian" : "Lihat rincian kegagalan";

	return (
		<div className={cn("min-w-0", className)}>
			{variant === "empty" ? (
				<div className="rounded-xl border border-graphite bg-charcoal p-5 sm:p-6">
					<p className="text-sm font-semibold text-snow">
						Gambar belum berhasil disimpan
					</p>
					<dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
						<div>
							<dt className="text-xs text-fog">Ditemukan</dt>
							<dd className="mt-1 font-mono text-xl font-bold text-snow tabular-nums">
								{discoveredCount}
							</dd>
						</div>
						<div>
							<dt className="text-xs text-fog">Tersimpan</dt>
							<dd className="mt-1 font-mono text-xl font-bold text-snow tabular-nums">
								{savedCount}
							</dd>
						</div>
					</dl>
					<p className="mt-4 text-sm text-fog">
						Beberapa gambar tidak dapat diambil atau disimpan.
					</p>
					<div className="mt-4">
						<p className="text-xs font-semibold text-snow">Penyebab</p>
						<ul className="mt-2 space-y-1.5 text-sm text-fog">
							{groups.map((group) => (
								<li
									key={group.category.key}
									className="flex items-baseline gap-2"
								>
									<span aria-hidden>•</span>
									<span className="min-w-0 flex-1">{group.category.label}</span>
									<span className="font-mono font-medium text-snow tabular-nums">
										{group.count}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			) : (
				<p className="text-sm text-fog">
					{`${failedImages.length} gambar tidak berhasil diambil`}
				</p>
			)}

			<div className={variant === "empty" ? "mt-4" : "mt-2"}>
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					aria-expanded={isOpen}
					aria-controls={detailId}
					className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite px-3 py-1.5 text-xs font-medium text-snow transition-colors hover:bg-obsidian focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span>{isOpen ? "Sembunyikan rincian" : toggleLabel}</span>
					<Icon
						icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon}
						size={14}
						aria-hidden
					/>
				</button>
			</div>

			{isOpen && (
				<div
					id={detailId}
					className="mt-4 space-y-4 border-t border-graphite pt-4"
				>
					{groups.map((group) => (
						<div key={group.category.key} className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="secondary">
									{group.category.label} ({group.count})
								</Badge>
								{group.category.actionHint && (
									<span className="text-xs text-fog">
										• {group.category.actionHint}
									</span>
								)}
							</div>

							<ul className="space-y-2 rounded-lg border border-graphite/50 bg-onyx/40 p-2.5">
								{group.images.map((image) => {
									const host = extractHost(image.url);
									const isCopied = copiedUrl === image.url;

									return (
										<li
											key={image.id}
											className="flex flex-col gap-2 rounded-md p-2 transition-colors hover:bg-charcoal/50 sm:flex-row sm:items-center sm:justify-between"
										>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<span className="shrink-0 font-mono text-[11px] font-semibold text-mist">
														{host}
													</span>
													{image.format && (
														<span className="shrink-0 rounded bg-graphite/60 px-1 py-0.5 font-mono text-[10px] text-fog uppercase">
															{image.format}
														</span>
													)}
												</div>
												<p
													className="mt-0.5 truncate font-mono text-xs text-fog"
													title={image.url}
												>
													{shortUrl(image.url, 60)}
												</p>
											</div>

											<div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
												<a
													href={image.url}
													target="_blank"
													rel="noreferrer"
													aria-label={`Buka gambar asli dari ${host}`}
													title="Buka gambar asli di tab baru"
													className="inline-flex size-9 items-center justify-center rounded-md border border-graphite text-snow transition-colors hover:bg-obsidian focus-visible:ring-2 focus-visible:ring-indigo"
												>
													<Icon icon={LinkSquare01Icon} size={14} aria-hidden />
												</a>
												<button
													type="button"
													onClick={() => void copyUrl(image.url)}
													aria-label={
														isCopied ? "URL tersalin" : "Salin URL sumber"
													}
													title="Salin URL sumber"
													className="inline-flex size-9 items-center justify-center rounded-md border border-graphite text-snow transition-colors hover:bg-obsidian focus-visible:ring-2 focus-visible:ring-indigo"
												>
													<Icon
														icon={isCopied ? Tick01Icon : Copy01Icon}
														size={14}
														aria-hidden
													/>
												</button>
											</div>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
