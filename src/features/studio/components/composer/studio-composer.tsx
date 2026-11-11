import { TextArea } from "@heroui/react";
import {
	ArrowUp01Icon,
	Cancel01Icon,
	PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import {
	type Dispatch,
	type FormEvent,
	type SetStateAction,
	useMemo,
	useRef,
	useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";
import { STUDIO_MIN_PROMPT_CHARS } from "@/features/studio/services/studio-prompt-validation";
import type { StudioScreenSuggestion } from "@/features/studio/services/studio-screen-suggestions";
import { shouldSubmitComposerEvent } from "@/features/studio/utils/composer-keyboard";
import { filterValidHexColors, StudioPaletteDisk } from "./studio-palette-disk";
import { StudioSuggestionRow } from "./studio-suggestion-row";

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
	value?: string;
	onValueChange?: Dispatch<SetStateAction<string>>;
	className?: string;
	selectedFrames?: { id: string; name: string }[];
	onRemoveFrame?: (id: string) => void;
	referenceLabel?: string | null;
	referenceColors?: readonly string[] | null;
	/** Next-screen cards derived from the project's own structure. */
	suggestions?: readonly StudioScreenSuggestion[];
}

export function StudioComposer({
	onSubmit,
	loading = false,
	value,
	onValueChange,
	className = "",
	selectedFrames = [],
	onRemoveFrame,
	referenceLabel,
	referenceColors,
	suggestions = [],
}: StudioComposerProps) {
	const [localPrompt, setLocalPrompt] = useState("");
	const prompt = value ?? localPrompt;
	const setPrompt = onValueChange ?? setLocalPrompt;
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const [clarify, setClarify] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const pending = useRef(false);
	const singleFrame = selectedFrames.length === 1 ? selectedFrames[0] : null;

	const resolvedColors = useMemo(() => {
		if (referenceColors && referenceColors.length > 0) {
			const valid = filterValidHexColors(referenceColors);
			if (valid.length > 0) return valid;
			return null;
		}
		if (!referenceLabel) return null;
		const preset = STUDIO_DESIGN_PRESETS.find(
			(entry) =>
				entry.name.toLowerCase() === referenceLabel.toLowerCase() ||
				entry.id.toLowerCase() === referenceLabel.toLowerCase(),
		);
		if (preset) {
			return [preset.tokens.canvas, preset.tokens.primary, preset.tokens.ink];
		}
		return null;
	}, [referenceColors, referenceLabel]);

	// The server rejects prompts shorter than the shared minimum, so the
	// composer applies the same rule client-side and explains it instead of
	// letting the request fail with a generic payload error.
	const trimmedPrompt = prompt.trim();
	const isTooShort =
		trimmedPrompt.length > 0 && trimmedPrompt.length < STUDIO_MIN_PROMPT_CHARS;
	const canSubmit =
		trimmedPrompt.length >= STUDIO_MIN_PROMPT_CHARS && !loading && !sending;

	async function submit() {
		const submitted = prompt;
		const trimmed = prompt.trim();
		if (trimmed.length < STUDIO_MIN_PROMPT_CHARS || loading || pending.current)
			return;
		pending.current = true;
		setSending(true);
		setError("");
		setClarify("");
		try {
			const result = await onSubmit(trimmed);
			if (result.accepted)
				setPrompt((current) => (current === submitted ? "" : current));
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

	// A suggestion only fills the composer: the user still reviews and submits,
	// so clicking a card never spends a generation credit on its own.
	function insertSuggestion(suggestion: StudioScreenSuggestion) {
		setPrompt(suggestion.prompt);
		setClarify("");
		inputRef.current?.focus();
	}

	return (
		<div
			data-testid="studio-composer"
			className={`min-w-0 ${className}`}
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{suggestions.length > 0 ? (
				<StudioSuggestionRow
					suggestions={suggestions}
					disabled={loading || sending}
					onSelect={insertSuggestion}
				/>
			) : null}
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
									className="flex size-11 items-center justify-center rounded text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-snow lg:size-6"
								>
									<Icon icon={Cancel01Icon} size={12} />
								</button>
							</span>
						))}
					</div>
				) : null}
				{referenceLabel ? (
					<div className="flex flex-wrap items-center gap-2">
						<span
							data-testid="studio-reference-chip"
							className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-iron px-1.5 py-1 text-xs text-mist"
						>
							{resolvedColors && resolvedColors.length > 0 ? (
								<StudioPaletteDisk
									colors={resolvedColors}
									label={referenceLabel}
								/>
							) : (
								<Icon
									icon={PaintBoardIcon}
									size={12}
									className="shrink-0 text-mist"
									aria-hidden="true"
								/>
							)}
							<span className="truncate">{referenceLabel}</span>
						</span>
					</div>
				) : null}
				<div className="flex items-end gap-2">
					<TextArea
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
						className="field-sizing-content max-h-40 min-h-12 min-w-0 flex-1 resize-none rounded-md border-0 bg-transparent px-1 text-sm leading-6 text-snow placeholder:text-fog focus-visible:outline-2 focus-visible:outline-snow"
					/>
					<button
						type="submit"
						disabled={!canSubmit}
						aria-label="Kirim prompt"
						aria-busy={loading || sending ? "true" : undefined}
						title="Kirim prompt (Enter)"
						style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
						className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
					>
						{loading || sending ? (
							<Spinner size={18} className="text-current" />
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
