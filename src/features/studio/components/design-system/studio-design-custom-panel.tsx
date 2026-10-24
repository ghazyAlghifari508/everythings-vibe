import {
	Cancel01Icon,
	FileCodeIcon,
	Image01Icon,
	Loading01Icon,
	Upload01Icon,
} from "@hugeicons/core-free-icons";
import { useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { AttachedLogo } from "@/features/studio/types/studio";
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
			className="flex w-full flex-col gap-4"
		>
			<p className="text-xs font-semibold text-mist">Unggah File Kustom</p>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2.5 rounded-xl border border-graphite bg-onyx p-4">
					<div className="flex items-center justify-between">
						<span className="flex items-center gap-2 text-sm font-semibold text-snow">
							<Icon icon={FileCodeIcon} size={15} className="text-fog" />
							File DESIGN.md
						</span>
						{state.mdName ? (
							<span className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => mdInputRef.current?.click()}
									className="rounded px-1.5 py-0.5 text-xs font-semibold text-mist underline underline-offset-2 hover:text-snow"
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
									<Icon icon={Cancel01Icon} size={13} />
								</button>
							</span>
						) : null}
					</div>

					{state.mdName ? (
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-graphite/60 bg-charcoal/60 px-3 py-2 text-xs">
							<span className="max-w-xs truncate font-semibold text-snow sm:max-w-md">
								{state.mdName}
							</span>
							{colorCount > 0 || fontFamily ? (
								<span className="text-fog">
									{colorCount} warna
									{fontFamily ? ` · ${fontFamily}` : ""}
								</span>
							) : null}
						</div>
					) : (
						<button
							type="button"
							onClick={() => mdInputRef.current?.click()}
							disabled={state.reading}
							className="flex min-h-18 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-graphite px-3 py-3 text-xs text-fog transition-colors hover:border-steel hover:text-mist disabled:opacity-50"
						>
							{state.reading ? (
								<Icon
									icon={Loading01Icon}
									size={16}
									className="motion-safe:animate-spin"
								/>
							) : (
								<Icon icon={Upload01Icon} size={16} />
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

				<div className="flex flex-col gap-2.5 rounded-xl border border-graphite bg-onyx p-4">
					<div className="flex items-center justify-between">
						<span className="flex items-center gap-2 text-sm font-semibold text-snow">
							<Icon icon={Image01Icon} size={15} className="text-fog" />
							Logo aplikasi
							<span className="text-xs font-normal text-fog">(opsional)</span>
						</span>
						{state.logo ? (
							<button
								type="button"
								onClick={() => onLogoChange(null)}
								aria-label="Hapus logo"
								className="rounded p-1 text-fog hover:text-snow"
							>
								<Icon icon={Cancel01Icon} size={13} />
							</button>
						) : null}
					</div>

					{state.logo ? (
						<div className="flex items-center justify-between gap-3 rounded-lg border border-graphite/60 bg-charcoal/60 px-3 py-2 text-xs">
							<div className="flex items-center gap-2.5 min-w-0">
								{state.logo.data ? (
									<img
										src={state.logo.data}
										alt="Preview logo"
										className="size-7 rounded object-contain border border-graphite bg-onyx p-0.5"
									/>
								) : null}
								<span className="max-w-xs truncate font-semibold text-snow sm:max-w-md">
									{state.logo.filename}
								</span>
							</div>
							<button
								type="button"
								onClick={() => logoInputRef.current?.click()}
								className="rounded px-1.5 py-0.5 text-xs font-semibold text-mist underline underline-offset-2 hover:text-snow"
							>
								Ganti
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => logoInputRef.current?.click()}
							className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-graphite px-3 py-2.5 text-xs text-fog transition-colors hover:border-steel hover:text-mist"
						>
							<Icon icon={Upload01Icon} size={16} />
							<span>Pilih file gambar logo</span>
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
		</div>
	);
}
