import { FileCode2, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRef } from "react";
import type { AttachedLogo } from "@/features/studio/components/design-system/start-with-design-modal";
import {
	readStudioDesignMdFile,
	readStudioLogoFile,
} from "@/features/studio/utils/studio-design-reference-readers";

export interface StudioDesignCustomState {
	mdName: string | null;
	mdText: string;
	mdError: string | null;
	reading: boolean;
	logo: AttachedLogo | null;
	logoError: string | null;
}

export interface StudioDesignCustomPanelProps {
	state: StudioDesignCustomState;
	onMdNameChange: (name: string | null, text: string) => void;
	onMdError: (error: string | null) => void;
	onReadingChange: (reading: boolean) => void;
	onLogoChange: (logo: AttachedLogo | null) => void;
	onLogoError: (error: string | null) => void;
	/** Declared colour count and font family of the accepted DESIGN.md. */
	colorCount: number;
	fontFamily: string | null;
}

/**
 * "Punya Saya" tab: a compact custom DESIGN.md upload plus an optional logo.
 * Nothing here generates; the parent stages the reference and only sends it on
 * explicit submit.
 */
export function StudioDesignCustomPanel({
	state,
	onMdNameChange,
	onMdError,
	onReadingChange,
	onLogoChange,
	onLogoError,
	colorCount,
	fontFamily,
}: StudioDesignCustomPanelProps) {
	const mdInputRef = useRef<HTMLInputElement>(null);
	const logoInputRef = useRef<HTMLInputElement>(null);

	async function handleMdFile(file: File | undefined) {
		if (!file) return;
		onMdError(null);
		onReadingChange(true);
		try {
			const outcome = await readStudioDesignMdFile(file);
			if ("error" in outcome) {
				onMdError(outcome.error);
				return;
			}
			onMdNameChange(outcome.filename, outcome.designMd);
		} finally {
			onReadingChange(false);
		}
	}

	function handleLogoFile(file: File | undefined) {
		if (!file) return;
		onLogoError(null);
		void readStudioLogoFile(file).then((outcome) => {
			if ("error" in outcome) {
				onLogoError(outcome.error);
				return;
			}
			onLogoChange(outcome.logo);
		});
	}

	return (
		<div
			role="tabpanel"
			aria-label="Punya Saya"
			className="flex flex-col gap-3"
		>
			<div className="flex flex-col gap-2 rounded-xl border border-graphite bg-onyx p-3.5">
				<span className="flex items-center gap-2 text-sm font-semibold text-snow">
					<FileCode2 size={15} aria-hidden className="text-fog" />
					File DESIGN.md
				</span>
				{state.mdName ? (
					<span className="flex flex-wrap items-center gap-2 text-xs">
						<span className="max-w-56 truncate font-semibold text-snow">
							{state.mdName}
						</span>
						{colorCount > 0 || fontFamily ? (
							<span className="text-fog">
								{colorCount} warna
								{fontFamily ? ` · ${fontFamily}` : ""}
							</span>
						) : null}
						<button
							type="button"
							onClick={() => mdInputRef.current?.click()}
							className="rounded px-1.5 py-0.5 font-semibold text-mist underline underline-offset-2 hover:text-snow"
						>
							Ganti
						</button>
						<button
							type="button"
							onClick={() => {
								onMdNameChange(null, "");
								onMdError(null);
							}}
							aria-label="Hapus file desain"
							className="rounded p-1 text-fog hover:text-snow"
						>
							<X size={13} aria-hidden />
						</button>
					</span>
				) : (
					<button
						type="button"
						onClick={() => mdInputRef.current?.click()}
						disabled={state.reading}
						className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-graphite px-3 text-xs text-fog transition-colors hover:border-steel hover:text-mist disabled:opacity-50"
					>
						{state.reading ? (
							<Loader2
								size={16}
								aria-hidden
								className="motion-safe:animate-spin"
							/>
						) : (
							<Upload size={16} aria-hidden />
						)}
						<span>
							{state.reading
								? "Membaca file..."
								: "Pilih file .md (maks 500 KB)"}
						</span>
					</button>
				)}
				<input
					ref={mdInputRef}
					type="file"
					accept=".md,.markdown,text/markdown"
					aria-label="Unggah file DESIGN.md"
					className="sr-only"
					onChange={(event) => {
						void handleMdFile(event.target.files?.[0]);
						event.target.value = "";
					}}
				/>
				{state.mdError ? (
					<p role="alert" className="text-xs text-crimson">
						{state.mdError}
					</p>
				) : null}
			</div>

			<div className="flex flex-col gap-2 rounded-xl border border-graphite bg-onyx p-3.5">
				<span className="flex items-center gap-2 text-sm font-semibold text-snow">
					<ImageIcon size={15} aria-hidden className="text-fog" />
					Logo aplikasi
					<span className="text-xs font-normal text-fog">(opsional)</span>
				</span>
				{state.logo ? (
					<span className="flex flex-wrap items-center gap-2 text-xs">
						<span className="max-w-56 truncate font-semibold text-snow">
							{state.logo.filename}
						</span>
						<button
							type="button"
							onClick={() => onLogoChange(null)}
							aria-label="Hapus logo"
							className="rounded p-1 text-fog hover:text-snow"
						>
							<X size={13} aria-hidden />
						</button>
					</span>
				) : (
					<button
						type="button"
						onClick={() => logoInputRef.current?.click()}
						className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-graphite px-3 text-xs font-semibold text-mist transition-colors hover:text-snow"
					>
						<Upload size={14} aria-hidden />
						Pilih logo
					</button>
				)}
				<input
					ref={logoInputRef}
					type="file"
					accept="image/*"
					aria-label="Unggah logo aplikasi"
					className="sr-only"
					onChange={(event) => {
						handleLogoFile(event.target.files?.[0]);
						event.target.value = "";
					}}
				/>
				{state.logoError ? (
					<p role="alert" className="text-xs text-crimson">
						{state.logoError}
					</p>
				) : null}
			</div>
		</div>
	);
}
