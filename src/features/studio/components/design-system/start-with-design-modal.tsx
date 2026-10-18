"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";
import { StudioDesignLogoSection } from "@/features/studio/components/design-system/studio-design-logo-section";
import { StudioDesignMdSection } from "@/features/studio/components/design-system/studio-design-md-section";
import { StudioScrapeDesignSources } from "@/features/studio/components/design-system/studio-scrape-design-sources";
import { validateStudioDesignMd } from "@/features/studio/services/studio-prompt-validation";
import type {
	AttachedDesignReference,
	AttachedLogo,
} from "@/features/studio/types/studio";
import { STUDIO_LOGO_MAX_BYTES } from "@/features/studio/types/studio-constants";

export interface StartWithDesignModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialReference?: AttachedDesignReference | null;
	scrapeSources: ScrapeDesignSource[];
	onApply: (reference: AttachedDesignReference) => Promise<void> | void;
}

export function StartWithDesignModal({
	open,
	onOpenChange,
	initialReference,
	scrapeSources,
	onApply,
}: StartWithDesignModalProps) {
	const [designMd, setDesignMd] = useState(initialReference?.designMd ?? "");
	const [uploadedMdName, setUploadedMdName] = useState<string | null>(null);
	const [scrapeSelection, setScrapeSelection] =
		useState<ScrapeDesignSource | null>(null);
	const [logo, setLogo] = useState<AttachedLogo | null>(
		initialReference?.logo ?? null,
	);
	const [error, setError] = useState<string | null>(null);
	const [logoError, setLogoError] = useState<string | null>(null);
	const [applying, setApplying] = useState(false);

	// Sync when opened with initial reference
	useEffect(() => {
		if (open) {
			setDesignMd(initialReference?.designMd ?? "");
			setLogo(initialReference?.logo ?? null);
			setError(null);
			setLogoError(null);
			setUploadedMdName(null);
			setScrapeSelection(null);
		}
	}, [open, initialReference]);

	// Handle Markdown file upload
	const handleMdFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		setError(null);
		const file = e.target.files?.[0];
		if (!file) return;
		setScrapeSelection(null);

		if (
			!file.name.toLowerCase().endsWith(".md") &&
			!file.name.toLowerCase().endsWith(".markdown") &&
			file.type !== "text/markdown" &&
			file.type !== "text/plain" &&
			file.type !== ""
		) {
			setError("Gunakan file berekstensi .md atau .markdown.");
			return;
		}

		if (file.size > 500 * 1024) {
			setError("Ukuran file .md melebihi batas 500 KB.");
			return;
		}

		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target?.result;
			if (typeof content === "string") {
				setDesignMd(content);
				setUploadedMdName(file.name);
			}
		};
		reader.onerror = () => {
			setError("Gagal membaca file .md. Coba paste langsung.");
		};
		reader.readAsText(file);
		// Reset input value so same file can be re-selected if needed
		e.target.value = "";
	};

	// Handle logo file upload
	const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		setLogoError(null);
		const file = e.target.files?.[0];
		if (!file) return;

		const lowerName = file.name.toLowerCase();
		if (lowerName.endsWith(".fig")) {
			setLogoError(
				"File .fig tidak didukung. Ekspor logo ke PNG, SVG, atau WebP dari Figma terlebih dahulu.",
			);
			return;
		}

		const mime = file.type.toLowerCase();
		const isSvg = lowerName.endsWith(".svg") || mime === "image/svg+xml";
		const isPng = lowerName.endsWith(".png") || mime === "image/png";
		const isJpg =
			lowerName.endsWith(".jpg") ||
			lowerName.endsWith(".jpeg") ||
			mime === "image/jpeg";
		const isWebp = lowerName.endsWith(".webp") || mime === "image/webp";

		if (!isSvg && !isPng && !isJpg && !isWebp) {
			setLogoError(
				"Format file tidak didukung. Gunakan PNG, JPEG, WebP, atau SVG.",
			);
			return;
		}

		const resolvedMime = isSvg
			? "image/svg+xml"
			: isPng
				? "image/png"
				: isWebp
					? "image/webp"
					: "image/jpeg";

		if (file.size > STUDIO_LOGO_MAX_BYTES) {
			setLogoError(
				"Ukuran logo maksimal 2MB. Silakan pilih file yang lebih kecil.",
			);
			return;
		}

		const reader = new FileReader();
		reader.onload = (event) => {
			const res = event.target?.result;
			if (typeof res === "string") {
				// data URL format: data:<mime>;base64,<data>
				const commaIdx = res.indexOf(",");
				const base64Data = commaIdx >= 0 ? res.slice(commaIdx + 1) : res;
				setLogo({
					filename: file.name,
					mimeType: resolvedMime,
					data: base64Data,
					previewUrl: res,
					byteLength: file.size,
				});
			}
		};
		reader.onerror = () => {
			setLogoError("Gagal membaca file logo.");
		};
		reader.readAsDataURL(file);
		e.target.value = "";
	};

	const handleConfirm = async () => {
		if (applying) return;
		setError(null);
		setLogoError(null);

		// A VibeScrape result is applied by reference: the server resolves the
		// stored DESIGN.md under ownership, so nothing is pasted or trusted here.
		if (scrapeSelection) {
			setApplying(true);
			try {
				await onApply({
					designMd: "",
					logo,
					designReference: { kind: "scrape", id: scrapeSelection.id },
				});
				onOpenChange(false);
			} catch (failure) {
				setError(
					failure instanceof Error
						? failure.message
						: "Gagal menyimpan referensi.",
				);
			} finally {
				setApplying(false);
			}
			return;
		}

		const checked = validateStudioDesignMd(designMd);
		if (!checked.ok) {
			setError(checked.error);
			return;
		}
		if (!checked.designMd) {
			setError("Masukkan teks DESIGN.md atau upload file .md terlebih dahulu.");
			return;
		}

		setApplying(true);
		try {
			await onApply({ designMd: checked.designMd, logo });
			onOpenChange(false);
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Gagal menyimpan referensi.",
			);
		} finally {
			setApplying(false);
		}
	};

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in-0" />
				<DialogPrimitive.Content
					className="fixed inset-2 sm:inset-6 md:inset-10 z-50 flex flex-col overflow-hidden rounded-xl border border-graphite bg-obsidian text-snow shadow-2xl animate-in fade-in-0 zoom-in-95 outline-none"
					aria-describedby="design-modal-desc"
				>
					{/* Modal Header */}
					<div className="flex shrink-0 items-start justify-between border-b border-graphite bg-charcoal px-5 py-4 sm:px-6">
						<div>
							<DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-snow sm:text-xl">
								Start with your design
							</DialogPrimitive.Title>
							<DialogPrimitive.Description
								id="design-modal-desc"
								className="mt-1 text-xs text-fog sm:text-sm"
							>
								Gunakan design system dan identitas visual yang sudah kamu punya
								sebagai referensi.
							</DialogPrimitive.Description>
						</div>
						<DialogPrimitive.Close
							className="rounded-md p-1.5 text-fog transition-colors hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							aria-label="Tutup modal"
						>
							<X size={18} aria-hidden />
						</DialogPrimitive.Close>
					</div>

					{/* Modal Body */}
					<div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
						<StudioScrapeDesignSources
							sources={scrapeSources}
							selectedId={scrapeSelection?.id ?? null}
							onSelect={(source) => {
								setScrapeSelection(source);
								setDesignMd("");
								setUploadedMdName(null);
								setError(null);
							}}
						/>

						{/* Divider */}
						<div className="border-t border-graphite" />

						<StudioDesignMdSection
							designMd={designMd}
							uploadedMdName={uploadedMdName}
							error={error}
							onDesignMdChange={(next) => {
								setScrapeSelection(null);
								setDesignMd(next);
							}}
							onErrorClear={() => setError(null)}
							onFileUpload={handleMdFileUpload}
						/>

						{/* Divider */}
						<div className="border-t border-graphite" />

						<StudioDesignLogoSection
							logo={logo}
							logoError={logoError}
							onLogoChange={setLogo}
							onFileUpload={handleLogoFileUpload}
						/>
					</div>

					{/* Modal Footer */}
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-graphite bg-charcoal px-5 py-4 sm:px-6">
						<div className="text-xs text-fog">
							{scrapeSelection ? (
								<span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
									<Check size={14} aria-hidden />
									<span>
										DESIGN.md dari{" "}
										{scrapeSelection.title ?? scrapeSelection.domain}
									</span>
								</span>
							) : designMd.trim() ? (
								<span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
									<Check size={14} aria-hidden />
									<span>DESIGN.md terisi</span>
									{logo ? <span>· Logo terpasang</span> : null}
								</span>
							) : (
								<span>Silakan isi DESIGN.md sebagai acuan desain.</span>
							)}
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="rounded-full border border-graphite bg-transparent px-4 py-2 text-xs font-semibold text-fog transition-colors hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Batalkan
							</button>
							<button
								type="button"
								onClick={() => void handleConfirm()}
								disabled={applying}
								className="btn-primary rounded-full px-5 py-2 text-xs font-semibold transition-all hover:brightness-105 active:scale-[0.98]"
							>
								Gunakan desain ini
							</button>
						</div>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
