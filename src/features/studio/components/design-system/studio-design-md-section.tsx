import {
	AlertCircleIcon,
	FileCodeIcon,
	Tick01Icon,
	Upload01Icon,
} from "@hugeicons/core-free-icons";
import { useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { STUDIO_DESIGN_MD_MAX_CHARS } from "@/features/studio/types/studio-constants";

interface StudioDesignMdSectionProps {
	designMd: string;
	uploadedMdName: string | null;
	error: string | null;
	onDesignMdChange: (value: string) => void;
	onErrorClear: () => void;
	onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Section A of the Start-with-design modal: paste or upload a DESIGN.md.
 *
 * The textarea keeps the operator's raw text, reports the live character count
 * against the real limit, and surfaces validation failures inline.
 */
export function StudioDesignMdSection({
	designMd,
	uploadedMdName,
	error,
	onDesignMdChange,
	onErrorClear,
	onFileUpload,
}: StudioDesignMdSectionProps) {
	const mdFileInputRef = useRef<HTMLInputElement>(null);

	return (
		<section aria-labelledby="section-design-md" className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3
						id="section-design-md"
						className="text-sm font-semibold text-snow flex items-center gap-2"
					>
						<Icon icon={FileCodeIcon} size={16} className="text-fog" />
						<span>DESIGN.md (Tokens & Styling Reference)</span>
					</h3>
					<p className="text-xs text-fog mt-0.5">
						Paste isi file DESIGN.md atau upload file markdown (.md).
					</p>
				</div>

				<div>
					<input
						ref={mdFileInputRef}
						type="file"
						accept=".md,.markdown,text/markdown"
						onChange={onFileUpload}
						className="hidden"
						aria-label="Upload file markdown DESIGN.md"
					/>
					<button
						type="button"
						onClick={() => mdFileInputRef.current?.click()}
						className="inline-flex items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-onyx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<Icon icon={Upload01Icon} size={13} />
						<span>{uploadedMdName ? "Ganti File .md" : "Upload File .md"}</span>
					</button>
				</div>
			</div>

			{uploadedMdName && (
				<div className="flex items-center gap-2 rounded-md bg-onyx px-3 py-1.5 text-xs text-mist border border-graphite">
					<Icon icon={Tick01Icon} size={14} className="text-emerald-400" />
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
						onDesignMdChange(e.target.value);
						if (error) onErrorClear();
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
						{STUDIO_DESIGN_MD_MAX_CHARS.toLocaleString("id-ID")} karakter
					</span>
				</div>
			</div>

			{error && (
				<p
					role="alert"
					className="flex items-center gap-1.5 text-xs text-red-400"
				>
					<Icon icon={AlertCircleIcon} size={14} />
					<span>{error}</span>
				</p>
			)}
		</section>
	);
}
