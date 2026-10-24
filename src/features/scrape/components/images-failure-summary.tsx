import {
	Alert02Icon,
	ArrowDown01Icon,
	ArrowUp01Icon,
	Copy01Icon,
	LinkSquare01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { ImageResult } from "@/features/scrape/components/images-result-asset";
import { shortUrl } from "@/features/scrape/components/images-result-card";
import {
	extractHost,
	groupImageFailures,
} from "@/features/scrape/utils/scrape-image-failures";

export interface ImagesFailureSummaryProps {
	failedImages: ImageResult[];
	className?: string;
}

export function ImagesFailureSummary({
	failedImages,
	className,
}: ImagesFailureSummaryProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

	if (failedImages.length === 0) return null;

	const groups = groupImageFailures(failedImages);

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

	return (
		<Alert
			variant="default"
			className={`border-graphite bg-charcoal ${className ?? ""}`}
		>
			<Icon
				icon={Alert02Icon}
				size={18}
				className="text-fog shrink-0"
				aria-hidden
			/>
			<div>
				<AlertTitle className="text-sm font-semibold text-snow">
					{failedImages.length} gambar belum dapat disimpan
				</AlertTitle>
				<AlertDescription className="mt-1 text-xs text-fog">
					Beberapa file gambar tidak dapat disimpan secara permanen ke galeri.
				</AlertDescription>

				<div className="mt-3 space-y-1.5">
					<p className="text-xs font-semibold text-snow">Rincian:</p>
					<ul className="space-y-1 text-xs text-fog">
						{groups.map((group) => (
							<li key={group.category.key} className="flex items-center gap-2">
								<span
									className="inline-block size-1.5 rounded-full bg-fog"
									aria-hidden
								/>
								<span className="font-mono font-medium text-snow tabular-nums">
									{group.count}
								</span>
								<span>{group.category.label}</span>
							</li>
						))}
					</ul>
				</div>

				<div className="mt-4">
					<button
						type="button"
						onClick={() => setIsOpen((prev) => !prev)}
						aria-expanded={isOpen}
						aria-controls="affected-images-detail"
						className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite px-3 py-1.5 text-xs font-medium text-snow transition-colors hover:bg-obsidian focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<span>{isOpen ? "Sembunyikan rincian" : "Lihat rincian"}</span>
						<Icon
							icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon}
							size={14}
							aria-hidden
						/>
					</button>
				</div>

				{isOpen && (
					<div
						id="affected-images-detail"
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
														<Icon
															icon={LinkSquare01Icon}
															size={14}
															aria-hidden
														/>
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
		</Alert>
	);
}
