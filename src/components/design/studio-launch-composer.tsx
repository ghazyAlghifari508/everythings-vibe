"use client";

import {
	ArrowUp,
	Loader2,
	Monitor,
	Palette,
	Smartphone,
	X,
} from "lucide-react";
import type { FormEvent, RefObject } from "react";
import type { StudioDesignMode } from "@/lib/prompts-ui-studio";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";
import { shouldSubmitComposerEvent } from "./composer-keyboard";
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
	loading,
	error,
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
	loading: boolean;
	error: string;
	onSubmit: () => void;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const canSubmit = prompt.trim().length > 0 && !loading;

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		onSubmit();
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-3 rounded-2xl border border-graphite bg-charcoal p-4 shadow-lg transition-colors focus-within:border-steel sm:p-5"
		>
			<label htmlFor="studio-prompt" className="block cursor-text">
				<span className="sr-only">Prompt Desain UI</span>
				<textarea
					ref={textareaRef}
					id="studio-prompt"
					value={prompt}
					onChange={(event) => onPromptChange(event.target.value)}
					onKeyDown={(event) => {
						if (shouldSubmitComposerEvent(event)) {
							event.preventDefault();
							if (canSubmit) onSubmit();
						}
					}}
					placeholder="Jelaskan kebutuhan antarmukamu... Contoh: Dashboard analitik penjualan dengan kartu metrik ringkasan, grafik tren bulanan, dan tabel transaksi terkini dengan filter status..."
					rows={5}
					disabled={loading}
					className="w-full resize-none bg-transparent font-sans text-sm leading-relaxed text-snow placeholder:text-fog focus:outline-none disabled:opacity-50 sm:text-base"
				/>
			</label>

			{reference ? (
				<div className="flex flex-wrap items-center gap-2 rounded-xl border border-graphite bg-onyx px-3 py-2 text-xs text-mist">
					<span className="text-fog">Referensi aktif:</span>
					<span className="max-w-48 truncate font-semibold text-snow">
						{reference.label}
					</span>
					{reference.logoFilename ? (
						<span className="max-w-40 truncate text-fog">
							· Logo ({reference.logoFilename})
						</span>
					) : null}
					<span className="ml-auto flex items-center gap-1">
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
							className="rounded p-1 text-fog hover:text-snow"
						>
							<X size={13} aria-hidden />
						</button>
					</span>
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
						<Monitor size={14} aria-hidden />
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
						<Smartphone size={14} aria-hidden />
						<span>Mobile</span>
					</button>
				</fieldset>

				<StudioPageCountSelect
					value={config.initialPageCount}
					onChange={(initialPageCount) => onConfigChange({ initialPageCount })}
					disabled={loading}
				/>

				<span className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={onOpenDesignPicker}
						disabled={loading}
						aria-label={reference ? "Ganti referensi desain" : "Pilih tampilan"}
						title={reference ? "Ganti referensi desain" : "Pilih tampilan"}
						className="flex size-9 items-center justify-center rounded-lg border border-graphite bg-onyx text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Palette
							size={15}
							aria-hidden
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
							<Loader2
								size={16}
								aria-hidden
								className="motion-safe:animate-spin"
							/>
						) : (
							<ArrowUp size={16} aria-hidden />
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
