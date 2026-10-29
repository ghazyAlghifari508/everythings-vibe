import {
	ArrowUp01Icon,
	Cancel01Icon,
	FileCodeIcon,
	Loading01Icon,
} from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioDesignSkillId } from "@/features/studio/services/studio-generation-options";
import { STUDIO_MIN_PROMPT_CHARS } from "@/features/studio/services/studio-prompt-validation";
import { shouldSubmitComposerEvent } from "@/features/studio/utils/composer-keyboard";
import {
	canvasComposerBottomCss,
	canvasComposerWidthCss,
} from "@/features/studio/utils/studio-canvas-layout";
import { StudioSkillSelect } from "./studio-skill-select";

/**
 * The server resolves the operation, so the composer only reports whether the
 * request was accepted and, when it was not, what the user still has to decide.
 */
export interface StudioComposerSubmitResult {
	accepted: boolean;
	/** Set when the server needs the user to be more specific. */
	clarify?: string;
}

export interface StudioComposerProps {
	onSubmit: (
		prompt: string,
	) => Promise<StudioComposerSubmitResult> | StudioComposerSubmitResult;
	loading?: boolean;
	className?: string;
	selectedFrames?: { id: string; name: string }[];
	onRemoveFrame?: (id: string) => void;
	designSkillId?: StudioDesignSkillId;
	onDesignSkillChange?: (skillId: StudioDesignSkillId) => void;
	referenceLabel?: string | null;
}

export function StudioComposer({
	onSubmit,
	loading = false,
	className = "",
	selectedFrames = [],
	onRemoveFrame,
	designSkillId,
	onDesignSkillChange,
	referenceLabel,
}: StudioComposerProps) {
	const [prompt, setPrompt] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const [clarify, setClarify] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const pending = useRef(false);
	const singleFrame = selectedFrames.length === 1 ? selectedFrames[0] : null;
	// The server rejects prompts shorter than the shared minimum, so the
	// composer applies the same rule client-side and explains it instead of
	// letting the request fail with a generic payload error.
	const trimmedPrompt = prompt.trim();
	const isTooShort =
		trimmedPrompt.length > 0 && trimmedPrompt.length < STUDIO_MIN_PROMPT_CHARS;
	const canSubmit =
		trimmedPrompt.length >= STUDIO_MIN_PROMPT_CHARS && !loading && !sending;

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.style.height = prompt ? "auto" : "";
		input.style.height = `${input.scrollHeight}px`;
	}, [prompt]);

	async function submit() {
		const trimmed = prompt.trim();
		if (trimmed.length < STUDIO_MIN_PROMPT_CHARS || loading || pending.current)
			return;
		pending.current = true;
		setSending(true);
		setError("");
		setClarify("");
		try {
			const result = await onSubmit(trimmed);
			if (result.accepted) setPrompt("");
			else if (result.clarify) setClarify(result.clarify);
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Permintaan belum terkirim. Coba lagi.",
			);
		} finally {
			pending.current = false;
			setSending(false);
		}
	}
	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		void submit();
	}

	return (
		<div
			data-testid="studio-composer"
			className={`absolute left-1/2 z-30 -translate-x-1/2 ${className}`}
			// The zoom controls own the bottom-right corner, so the composer is
			// inset from both sides and its width is capped by the same
			// clearance fit-to-content reserves. It therefore narrows on small
			// viewports instead of overlapping the zoom row.
			style={{
				bottom: canvasComposerBottomCss(),
				width: canvasComposerWidthCss(),
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			<form
				onSubmit={handleSubmit}
				className="flex flex-col gap-3 rounded-xl border border-iron bg-obsidian p-3 text-snow focus-within:border-snow"
			>
				{selectedFrames.length > 0 ? (
					<div className="flex max-h-20 flex-wrap items-center gap-2 overflow-y-auto">
						<span className="text-xs text-fog">
							{singleFrame
								? `Editing: ${singleFrame.name}`
								: `Merevisi ${selectedFrames.length} layar terpilih`}
						</span>
						{selectedFrames.map((frame) => (
							<span
								key={frame.id}
								className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-iron px-1.5 py-0.5 text-xs text-snow"
							>
								<span className="truncate">{frame.name}</span>
								<button
									type="button"
									aria-label={`Lepas ${frame.name}`}
									onClick={() => onRemoveFrame?.(frame.id)}
									className="rounded p-0.5 hover:bg-steel focus-visible:outline-2 focus-visible:outline-snow"
								>
									<Icon icon={Cancel01Icon} size={12} />
								</button>
							</span>
						))}
					</div>
				) : null}
				{onDesignSkillChange || referenceLabel ? (
					<div className="flex flex-wrap items-center gap-2">
						{onDesignSkillChange && designSkillId ? (
							<StudioSkillSelect
								value={designSkillId}
								onChange={onDesignSkillChange}
								disabled={loading || sending}
							/>
						) : null}
						{referenceLabel ? (
							<span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-iron px-1.5 py-1 text-xs text-mist">
								<Icon icon={FileCodeIcon} size={12} className="shrink-0" />
								<span className="truncate">{referenceLabel}</span>
							</span>
						) : null}
					</div>
				) : null}
				<div className="flex items-end gap-2">
					<textarea
						ref={inputRef}
						value={prompt}
						rows={2}
						aria-label="Instruksi desain"
						aria-describedby={isTooShort ? "studio-composer-hint" : undefined}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (shouldSubmitComposerEvent(event)) {
								event.preventDefault();
								void submit();
							}
						}}
						placeholder={
							singleFrame
								? `Minta perubahan khusus untuk layar ${singleFrame.name}...`
								: selectedFrames.length > 1
									? `Minta perubahan untuk ${selectedFrames.length} layar terpilih...`
									: "Minta revisi, atau sebutkan halaman baru yang ingin dibuat..."
						}
						disabled={loading || sending}
						className="max-h-40 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-1 text-sm leading-6 text-snow placeholder:text-fog focus:outline-none disabled:opacity-60"
					/>
					<button
						type="submit"
						disabled={!canSubmit}
						aria-label="Kirim prompt"
						title="Kirim prompt (Enter)"
						style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
						className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
					>
						{loading || sending ? (
							<Icon
								icon={Loading01Icon}
								size={18}
								className="motion-safe:animate-spin"
							/>
						) : (
							<Icon icon={ArrowUp01Icon} size={18} />
						)}
					</button>
				</div>
				{error ? (
					<p role="alert" className="text-xs text-crimson">
						{error}
					</p>
				) : null}
				{!error && clarify ? (
					<output className="text-xs text-mist">{clarify}</output>
				) : null}
				{isTooShort ? (
					<p id="studio-composer-hint" className="text-xs text-fog">
						{`Tulis minimal ${STUDIO_MIN_PROMPT_CHARS} karakter agar instruksinya jelas.`}
					</p>
				) : null}
			</form>
		</div>
	);
}
