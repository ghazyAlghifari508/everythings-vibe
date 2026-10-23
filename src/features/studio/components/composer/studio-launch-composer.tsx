"use client";

import {
	ArrowUp01Icon,
	AttachmentIcon,
	Cancel01Icon,
	ComputerIcon,
	Loading01Icon,
	PaintBoardIcon,
	SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import {
	type ChangeEvent,
	type FormEvent,
	type RefObject,
	useRef,
	useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import { useTypewriterPlaceholder } from "@/features/studio/hooks/use-typewriter-placeholder";
import type { StudioDesignSkillId } from "@/features/studio/services/studio-generation-options";
import {
	validateStudioPrdFilename,
	validateStudioPrdText,
} from "@/features/studio/services/studio-prd-helpers";
import { STUDIO_PRD_FILE_MAX_BYTES } from "@/features/studio/types/studio-constants";
import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";
import { shouldSubmitComposerEvent } from "@/features/studio/utils/composer-keyboard";
import { StudioPageCountSelect } from "./studio-page-count-select";
import { StudioSkillSelect } from "./studio-skill-select";

export interface LaunchComposerConfig {
	designMode: StudioDesignMode;
	designSkillId: StudioDesignSkillId;
	initialPageCount: number;
}

export interface LaunchComposerReference {
	label: string;
	logoFilename: string | null;
}

export interface StudioPrdAttachmentState {
	filename: string;
	content: string;
}

// Initial-project composer for the Studio landing workspace. Page count only
// appears here: revision composers must not offer it.
export function StudioLaunchComposer({
	prompt,
	onPromptChange,
	config,
	onConfigChange,
	reference,
	onOpenDesignPicker,
	onRemoveReference,
	prd,
	onPrdChange,
	loading,
	error,
	onError,
	onSubmit,
	textareaRef,
}: {
	prompt: string;
	onPromptChange: (value: string) => void;
	config: LaunchComposerConfig;
	onConfigChange: (patch: Partial<LaunchComposerConfig>) => void;
	reference: LaunchComposerReference | null;
	onOpenDesignPicker: () => void;
	onRemoveReference: () => void;
	prd?: StudioPrdAttachmentState | null;
	onPrdChange?: (prd: StudioPrdAttachmentState | null) => void;
	loading: boolean;
	error: string;
	onError?: (error: string) => void;
	onSubmit: () => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isFocused, setIsFocused] = useState(false);

	const dynamicPlaceholder = useTypewriterPlaceholder({
		mode: config.designMode,
		isEmpty: prompt.trim().length === 0,
		isFocused,
	});

	const canSubmit = prompt.trim().length > 0 && !loading;

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		onSubmit();
	}

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		const validName = validateStudioPrdFilename(file.name);
		if (!validName.ok) {
			onError?.(validName.error);
			return;
		}

		if (file.size > STUDIO_PRD_FILE_MAX_BYTES) {
			onError?.(
				`Ukuran file PRD melebihi batas ${(STUDIO_PRD_FILE_MAX_BYTES / 1024).toFixed(0)} KB.`,
			);
			return;
		}

		try {
			const text = await file.text();
			const validContent = validateStudioPrdText(text);
			if (!validContent.ok) {
				onError?.(validContent.error);
				return;
			}
			onError?.("");
			onPrdChange?.({
				filename: validName.filename,
				content: validContent.content,
			});
		} catch {
			onError?.("Gagal membaca file .md. Coba pilih kembali.");
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-3 rounded-2xl border border-graphite bg-charcoal p-4 shadow-lg transition-colors focus-within:border-steel sm:p-5"
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".md"
				onChange={handleFileChange}
				className="sr-only hidden"
				tabIndex={-1}
				aria-hidden
			/>

			<label htmlFor="studio-prompt" className="block cursor-text">
				<span className="sr-only">Prompt Desain UI</span>
				<textarea
					ref={textareaRef}
					id="studio-prompt"
					value={prompt}
					onChange={(event) => onPromptChange(event.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onKeyDown={(event) => {
						if (shouldSubmitComposerEvent(event)) {
							event.preventDefault();
							if (canSubmit) onSubmit();
						}
					}}
					placeholder={dynamicPlaceholder}
					rows={5}
					disabled={loading}
					className="w-full resize-none bg-transparent font-sans text-sm leading-relaxed text-snow placeholder:text-fog focus:outline-none disabled:opacity-50 sm:text-base"
				/>
			</label>

			{prd || reference ? (
				<div className="flex flex-wrap items-center gap-2">
					{prd ? (
						<section
							aria-label="Lampiran PRD aktif"
							className="inline-flex items-center gap-2 rounded-xl border border-graphite bg-onyx px-3 py-1.5 text-xs text-mist"
						>
							<span className="flex size-5 shrink-0 items-center justify-center rounded bg-charcoal font-mono text-[9px] font-bold text-indigo">
								MD
							</span>
							<div className="flex min-w-0 items-center gap-1.5">
								<span
									className="max-w-44 truncate font-semibold text-snow sm:max-w-64"
									title={prd.filename}
								>
									{prd.filename}
								</span>
								<span className="text-[11px] text-fog">
									Product requirements · Ready
								</span>
							</div>
							<span className="flex items-center gap-1">
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									disabled={loading}
									aria-label="Ganti lampiran PRD"
									className="rounded px-1.5 py-0.5 font-semibold text-mist underline underline-offset-2 hover:text-snow disabled:opacity-50"
								>
									Ganti
								</button>
								<button
									type="button"
									onClick={() => {
										onError?.("");
										onPrdChange?.(null);
									}}
									disabled={loading}
									aria-label="Hapus lampiran PRD"
									title="Hapus lampiran PRD"
									className="rounded p-0.5 text-fog hover:text-snow disabled:opacity-50"
								>
									<Icon icon={Cancel01Icon} size={13} />
								</button>
							</span>
						</section>
					) : null}

					{reference ? (
						<section
							aria-label="Referensi desain aktif"
							className="inline-flex items-center gap-2 rounded-xl border border-graphite bg-onyx px-3 py-1.5 text-xs text-mist transition-colors hover:border-steel"
						>
							<Icon
								icon={PaintBoardIcon}
								size={14}
								className="shrink-0 text-indigo"
							/>
							<div className="flex min-w-0 items-center gap-1">
								<span
									className="max-w-44 truncate font-semibold text-snow sm:max-w-60"
									title={reference.label}
								>
									{reference.label}
								</span>
								{reference.logoFilename ? (
									<span
										className="max-w-36 truncate text-[11px] text-fog"
										title={reference.logoFilename}
									>
										· Logo ({reference.logoFilename})
									</span>
								) : null}
							</div>
							<span className="flex items-center gap-1">
								<button
									type="button"
									onClick={onOpenDesignPicker}
									className="rounded px-1.5 py-0.5 font-semibold text-mist underline underline-offset-2 hover:text-snow"
								>
									Ganti
								</button>
								<button
									type="button"
									onClick={onRemoveReference}
									aria-label="Lepas referensi desain"
									title="Lepas referensi desain"
									className="rounded p-0.5 text-fog hover:text-snow"
								>
									<Icon icon={Cancel01Icon} size={13} />
								</button>
							</span>
						</section>
					) : null}
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-2 border-t border-graphite/60 pt-3">
				<fieldset
					aria-label="Pilih mode desain antarmuka"
					className="m-0 flex items-center gap-1 rounded-xl border border-graphite bg-onyx p-1"
				>
					<button
						type="button"
						aria-pressed={config.designMode === "web"}
						onClick={() => onConfigChange({ designMode: "web" })}
						disabled={loading}
						className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
							config.designMode === "web"
								? "border border-graphite/80 bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						<Icon icon={ComputerIcon} size={14} />
						<span>Web</span>
					</button>
					<button
						type="button"
						aria-pressed={config.designMode === "mobile"}
						onClick={() => onConfigChange({ designMode: "mobile" })}
						disabled={loading}
						className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
							config.designMode === "mobile"
								? "border border-graphite/80 bg-charcoal text-snow"
								: "text-fog hover:text-mist"
						}`}
					>
						<Icon icon={SmartPhone01Icon} size={14} />
						<span>Mobile</span>
					</button>
				</fieldset>

				<StudioPageCountSelect
					value={config.initialPageCount}
					onChange={(initialPageCount) => onConfigChange({ initialPageCount })}
					disabled={loading}
				/>

				<span className="ml-auto flex items-center gap-2">
					<div className="group relative">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={loading}
							aria-label={
								prd
									? "Ganti lampiran PRD"
									: "Tambahkan dokumen kebutuhan aplikasi (.md)"
							}
							title={
								prd
									? "Ganti lampiran PRD"
									: "Tambahkan dokumen kebutuhan aplikasi (.md)"
							}
							className="flex size-9 items-center justify-center rounded-lg border border-graphite bg-onyx text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Icon
								icon={AttachmentIcon}
								size={15}
								className={prd ? "text-indigo" : undefined}
							/>
						</button>
						{!prd ? (
							<div
								role="tooltip"
								className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-graphite bg-charcoal p-2.5 text-center text-xs shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:block"
							>
								<p className="font-semibold text-snow">
									Tambahkan dokumen kebutuhan aplikasi (.md)
								</p>
								<p className="mt-1 text-[11px] leading-relaxed text-fog">
									AI menggunakan dokumen ini untuk memahami fitur dan kebutuhan
									aplikasimu.
								</p>
							</div>
						) : null}
					</div>
					<button
						type="button"
						onClick={onOpenDesignPicker}
						disabled={loading}
						aria-label={reference ? "Ganti referensi desain" : "Pilih tampilan"}
						title={reference ? "Ganti referensi desain" : "Pilih tampilan"}
						className="flex size-9 items-center justify-center rounded-lg border border-graphite bg-onyx text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Icon
							icon={PaintBoardIcon}
							size={15}
							className={reference ? "text-indigo" : undefined}
						/>
					</button>
					<StudioSkillSelect
						value={config.designSkillId}
						onChange={(designSkillId) => onConfigChange({ designSkillId })}
						disabled={loading}
					/>
					<button
						type="submit"
						disabled={!canSubmit}
						aria-label="Kirim prompt"
						title="Kirim prompt (Enter)"
						className="flex size-9 items-center justify-center rounded-lg bg-snow text-onyx transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-40"
					>
						{loading ? (
							<Icon
								icon={Loading01Icon}
								size={16}
								className="motion-safe:animate-spin"
							/>
						) : (
							<Icon icon={ArrowUp01Icon} size={16} />
						)}
					</button>
				</span>
			</div>

			{error ? (
				<p role="alert" className="text-xs text-crimson">
					{error}
				</p>
			) : null}
		</form>
	);
}
