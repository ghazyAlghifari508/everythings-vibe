import { AlertCircle, ImageIcon, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import type { AttachedLogo } from "@/features/studio/components/design-system/start-with-design-modal";
import { formatStudioBytes } from "@/features/studio/utils/format-studio-bytes";

interface StudioDesignLogoSectionProps {
	logo: AttachedLogo | null;
	logoError: string | null;
	onLogoChange: (logo: AttachedLogo | null) => void;
	onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Section B of the Start-with-design modal: an optional application logo that
 * the generated screens place in their navbar/header.
 */
export function StudioDesignLogoSection({
	logo,
	logoError,
	onLogoChange,
	onFileUpload,
}: StudioDesignLogoSectionProps) {
	const logoFileInputRef = useRef<HTMLInputElement>(null);

	return (
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
					Sertakan logo resmi aplikasi untuk ditempatkan pada navbar/header
					hasil rancangan.
				</p>
			</div>

			<input
				ref={logoFileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/svg+xml"
				onChange={onFileUpload}
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
									? ` · ${formatStudioBytes(logo.byteLength)}`
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
							onClick={() => onLogoChange(null)}
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
							PNG, JPEG, WebP, atau SVG (maks 2MB). File .fig tidak didukung.
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
	);
}
