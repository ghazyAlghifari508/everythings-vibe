"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	AlertCircle,
	Check,
	FileCode2,
	ImageIcon,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	STUDIO_DESIGN_MD_MAX_CHARS,
	STUDIO_LOGO_MAX_BYTES,
} from "@/lib/constants";
import { validateStudioDesignMd } from "@/lib/prompts-ui-studio";

export interface AttachedLogo {
	filename: string;
	mimeType: string;
	data: string; // base64
	previewUrl?: string;
	byteLength?: number;
}

export interface AttachedDesignReference {
	designMd: string;
	logo: AttachedLogo | null;
}

export interface StartWithDesignModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialReference?: AttachedDesignReference | null;
	onApply: (reference: AttachedDesignReference) => void;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StartWithDesignModal({
	open,
	onOpenChange,
	initialReference,
	onApply,
}: StartWithDesignModalProps) {
	const [designMd, setDesignMd] = useState(initialReference?.designMd ?? "");
	const [uploadedMdName, setUploadedMdName] = useState<string | null>(null);
	const [logo, setLogo] = useState<AttachedLogo | null>(
		initialReference?.logo ?? null,
	);
	const [error, setError] = useState<string | null>(null);
	const [logoError, setLogoError] = useState<string | null>(null);

	const mdFileInputRef = useRef<HTMLInputElement>(null);
	const logoFileInputRef = useRef<HTMLInputElement>(null);

	// Sync when opened with initial reference
	useEffect(() => {
		if (open) {
			setDesignMd(initialReference?.designMd ?? "");
			setLogo(initialReference?.logo ?? null);
			setError(null);
			setLogoError(null);
			setUploadedMdName(null);
		}
	}, [open, initialReference]);

	// Handle Markdown file upload
	const handleMdFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		setError(null);
		const file = e.target.files?.[0];
		if (!file) return;

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

	const handleConfirm = () => {
		setError(null);
		setLogoError(null);

		const checked = validateStudioDesignMd(designMd);
		if (!checked.ok) {
			setError(checked.error);
			return;
		}
		if (!checked.designMd) {
			setError("Masukkan teks DESIGN.md atau upload file .md terlebih dahulu.");
			return;
		}

		onApply({
			designMd: checked.designMd,
			logo,
		});
		onOpenChange(false);
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
						{/* Section A: DESIGN.md */}
						<section aria-labelledby="section-design-md" className="space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<h3
										id="section-design-md"
										className="text-sm font-semibold text-snow flex items-center gap-2"
									>
										<FileCode2 size={16} className="text-fog" aria-hidden />
										<span>DESIGN.md (Tokens & Styling Reference)</span>
									</h3>
									<p className="text-xs text-fog mt-0.5">
										Paste isi file DESIGN.md atau upload file markdown (.md).
									</p>
								</div>

								{/* Upload MD Button */}
								<div>
									<input
										ref={mdFileInputRef}
										type="file"
										accept=".md,.markdown,text/markdown"
										onChange={handleMdFileUpload}
										className="hidden"
										aria-label="Upload file markdown DESIGN.md"
									/>
									<button
										type="button"
										onClick={() => mdFileInputRef.current?.click()}
										className="inline-flex items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									>
										<Upload size={13} aria-hidden />
										<span>
											{uploadedMdName ? "Ganti File .md" : "Upload File .md"}
										</span>
									</button>
								</div>
							</div>

							{uploadedMdName && (
								<div className="flex items-center gap-2 rounded-md bg-onyx px-3 py-1.5 text-xs text-mist border border-graphite">
									<Check size={14} className="text-emerald-400" aria-hidden />
									<span>
										File terpilih:{" "}
										<strong className="text-snow">{uploadedMdName}</strong>
									</span>
								</div>
							)}

							<div className="relative">
								<textarea
									value={designMd}
									onChange={(e) => {
										setDesignMd(e.target.value);
										if (error) setError(null);
									}}
									rows={12}
									placeholder={`# Brand Design System
## Tokens - Colors
| Name | Hex | Role |
| Canvas | #ffffff | Background utama |
| Primary | #0f0f0f | Tombol dan teks utama |
| Accent | #3b82f6 | Highlight dan link |

## Tokens - Typography
- Heading font: Inter, sans-serif
- Body font: Inter, sans-serif

## Components
- Primary Button: rounded-full, solid ink, white text
- Card: rounded-xl, 1px border hairline`}
									className="w-full resize-y rounded-lg border border-graphite bg-onyx p-3.5 font-mono text-xs leading-5 text-mist placeholder:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
									aria-label="Isi dokumen DESIGN.md"
								/>
								<div className="mt-1 flex items-center justify-between text-[11px] text-fog">
									<span>
										Format Markdown · Warna, tipografi, radius, komponen, dan
										Do/Don&apos;t
									</span>
									<span
										className={
											designMd.length > STUDIO_DESIGN_MD_MAX_CHARS
												? "text-red-400 font-semibold"
												: ""
										}
									>
										{designMd.length.toLocaleString("id-ID")} /{" "}
										{STUDIO_DESIGN_MD_MAX_CHARS.toLocaleString("id-ID")}{" "}
										karakter
									</span>
								</div>
							</div>

							{error && (
								<p
									role="alert"
									className="flex items-center gap-1.5 text-xs text-red-400"
								>
									<AlertCircle size={14} aria-hidden />
									<span>{error}</span>
								</p>
							)}
						</section>

						{/* Divider */}
						<div className="border-t border-graphite" />

						{/* Section B: Logo */}
						<section aria-labelledby="section-logo" className="space-y-3">
							<div>
								<h3
									id="section-logo"
									className="text-sm font-semibold text-snow flex items-center gap-2"
								>
									<ImageIcon size={16} className="text-fog" aria-hidden />
									<span>Application Logo (Opsional)</span>
								</h3>
								<p className="text-xs text-fog mt-0.5">
									Sertakan logo resmi aplikasi untuk ditempatkan pada
									navbar/header hasil rancangan.
								</p>
							</div>

							<input
								ref={logoFileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/webp,image/svg+xml"
								onChange={handleLogoFileUpload}
								className="hidden"
								aria-label="Upload logo aplikasi"
							/>

							{logo ? (
								<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-graphite bg-charcoal p-3.5">
									<div className="flex items-center gap-3">
										<div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-graphite bg-onyx p-1.5 overflow-hidden">
											{logo.previewUrl ? (
												<img
													src={logo.previewUrl}
													alt="Preview logo"
													className="max-h-full max-w-full object-contain"
												/>
											) : (
												<ImageIcon size={24} className="text-fog" aria-hidden />
											)}
										</div>
										<div>
											<p className="text-xs font-semibold text-snow truncate max-w-[220px] sm:max-w-md">
												{logo.filename}
											</p>
											<p className="text-[11px] text-fog font-mono mt-0.5">
												{logo.mimeType}
												{logo.byteLength
													? ` · ${formatBytes(logo.byteLength)}`
													: ""}
											</p>
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => logoFileInputRef.current?.click()}
											className="rounded-lg border border-graphite bg-onyx px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											Ganti Logo
										</button>
										<button
											type="button"
											onClick={() => setLogo(null)}
											aria-label="Hapus logo"
											title="Hapus logo"
											className="inline-flex size-8 items-center justify-center rounded-lg border border-graphite bg-onyx text-fog transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
										>
											<Trash2 size={14} aria-hidden />
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									onClick={() => logoFileInputRef.current?.click()}
									className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-graphite bg-charcoal/50 p-6 text-center transition-colors hover:border-mist hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									<div className="flex size-10 items-center justify-center rounded-full bg-onyx text-fog">
										<Upload size={18} aria-hidden />
									</div>
									<div>
										<p className="text-xs font-semibold text-snow">
											Klik untuk memilih file logo
										</p>
										<p className="text-[11px] text-fog mt-0.5">
											PNG, JPEG, WebP, atau SVG (maks 2MB). File .fig tidak
											didukung.
										</p>
									</div>
								</button>
							)}

							{logoError && (
								<p
									role="alert"
									className="flex items-center gap-1.5 text-xs text-red-400"
								>
									<AlertCircle size={14} aria-hidden />
									<span>{logoError}</span>
								</p>
							)}
						</section>
					</div>

					{/* Modal Footer */}
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-graphite bg-charcoal px-5 py-4 sm:px-6">
						<div className="text-xs text-fog">
							{designMd.trim() ? (
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
								onClick={handleConfirm}
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
