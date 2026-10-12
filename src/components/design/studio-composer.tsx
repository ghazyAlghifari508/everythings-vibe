import { ArrowUp, Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

export type StudioComposerScope = "add" | "revise" | "project";

export interface StudioComposerProps {
	onSubmit: (
		prompt: string,
		scope: StudioComposerScope,
	) => Promise<boolean> | boolean;
	loading?: boolean;
	className?: string;
	selectedFrames?: { id: string; name: string }[];
	onRemoveFrame?: (id: string) => void;
}

/**
 * Operation scope is derived from real selection state only: with frames
 * selected the request revises exactly those frames, and with nothing selected
 * it applies to the whole project. Adding a screen is an explicit project-level
 * action in the workspace menu, so it is never inferred from prompt wording.
 */
export function resolveComposerScope(
	selectedFrameCount: number,
): StudioComposerScope {
	return selectedFrameCount > 0 ? "revise" : "project";
}

export function StudioComposer({
	onSubmit,
	loading = false,
	className = "",
	selectedFrames = [],
	onRemoveFrame,
}: StudioComposerProps) {
	const [prompt, setPrompt] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const pending = useRef(false);
	const scope = resolveComposerScope(selectedFrames.length);
	const singleFrame = selectedFrames.length === 1 ? selectedFrames[0] : null;

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.style.height = prompt ? "auto" : "";
		input.style.height = `${input.scrollHeight}px`;
	}, [prompt]);

	async function submit() {
		const trimmed = prompt.trim();
		if (!trimmed || loading || pending.current) return;
		pending.current = true;
		setSending(true);
		setError("");
		try {
			const accepted = await onSubmit(trimmed, scope);
			if (accepted === true) setPrompt("");
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
			className={`absolute bottom-4 left-1/2 z-30 w-full max-w-2xl -translate-x-1/2 px-3 sm:bottom-6 ${className}`}
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
									<X size={12} aria-hidden />
								</button>
							</span>
						))}
					</div>
				) : null}
				<div className="flex items-end gap-2">
					<textarea
						ref={inputRef}
						value={prompt}
						rows={2}
						aria-label="Instruksi desain"
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								!event.shiftKey &&
								!event.nativeEvent.isComposing
							) {
								event.preventDefault();
								void submit();
							}
						}}
						placeholder={
							singleFrame
								? `Minta perubahan khusus untuk layar ${singleFrame.name}...`
								: selectedFrames.length > 1
									? `Minta perubahan untuk ${selectedFrames.length} layar terpilih...`
									: "Minta revisi untuk seluruh project..."
						}
						disabled={loading || sending}
						className="max-h-40 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-1 text-sm leading-6 text-snow placeholder:text-fog focus:outline-none disabled:opacity-60"
					/>
					<button
						type="submit"
						disabled={loading || sending || !prompt.trim()}
						aria-label="Kirim prompt"
						title="Kirim prompt (Enter)"
						style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
						className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
					>
						{loading || sending ? (
							<Loader2 size={18} className="motion-safe:animate-spin" />
						) : (
							<ArrowUp size={18} />
						)}
					</button>
				</div>
				{error ? (
					<p role="alert" className="text-xs text-crimson">
						{error}
					</p>
				) : null}
			</form>
		</div>
	);
}
