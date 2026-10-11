import { ArrowUp, Loader2, Plus, X } from "lucide-react";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

export type StudioComposerScope = "add" | "revise" | "project";

export interface StudioComposerProps {
	selectedFrameName?: string | null;
	onClearSelectedFrame?: () => void;
	onSubmit: (
		prompt: string,
		scope: StudioComposerScope,
	) => Promise<boolean> | boolean;
	loading?: boolean;
	className?: string;
	designSystemControl?: ReactNode;
	selectedFrames?: { id: string; name: string }[];
	onRemoveFrame?: (id: string) => void;
}

export function StudioComposer({
	selectedFrameName,
	onClearSelectedFrame,
	onSubmit,
	loading = false,
	className = "",
	designSystemControl,
	selectedFrames = [],
	onRemoveFrame,
}: StudioComposerProps) {
	const [prompt, setPrompt] = useState("");
	const [adding, setAdding] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const pending = useRef(false);
	const scope =
		(selectedFrameName || selectedFrames.length) && !adding ? "revise" : "add";

	useEffect(() => {
		if (selectedFrameName) setAdding(false);
	}, [selectedFrameName]);
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
				<div className="flex flex-wrap items-center justify-between gap-2">
					{selectedFrameName && !adding ? (
						<span className="inline-flex max-w-full items-center gap-2 rounded-md border border-iron px-2 py-1 text-xs text-snow">
							<span className="truncate">Editing: {selectedFrameName}</span>
							<button
								type="button"
								onClick={onClearSelectedFrame}
								aria-label="Beralih ke seluruh project"
								className="rounded p-1 hover:bg-steel focus-visible:outline-2"
							>
								<X size={14} />
							</button>
						</span>
					) : (
						<span className="text-xs text-fog">
							{adding ? "Tambah layar baru" : "Seluruh Project"}
						</span>
					)}
					<div className="flex items-center gap-1">
						<button
							type="button"
							disabled={loading || sending}
							aria-pressed={adding}
							onClick={() => {
								setAdding(true);
								inputRef.current?.focus();
							}}
							className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 disabled:opacity-50"
						>
							<Plus size={16} />
							Tambah Halaman
						</button>
						{designSystemControl}
					</div>
					{!adding && selectedFrames.length > 0 ? (
						<div className="flex max-h-20 flex-wrap gap-2 overflow-y-auto">
							{selectedFrames.map((frame) => (
								<span
									key={frame.id}
									className="inline-flex max-w-full items-center gap-2 rounded-md border border-iron px-2 text-xs text-snow"
								>
									<span className="truncate">{frame.name}</span>
									<button
										type="button"
										aria-label={`Lepas ${frame.name}`}
										onClick={() => onRemoveFrame?.(frame.id)}
										className="p-2 focus-visible:outline-2"
									>
										<X size={14} />
									</button>
								</span>
							))}
						</div>
					) : null}
				</div>
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
							selectedFrameName && !adding
								? `Minta perubahan khusus untuk layar ${selectedFrameName}...`
								: "Minta AI menambah halaman atau merevisi UI..."
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
