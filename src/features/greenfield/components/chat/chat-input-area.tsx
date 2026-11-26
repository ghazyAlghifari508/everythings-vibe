import {
	ArrowUp02Icon,
	LockKeyIcon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Anything the user expects to act on its own; a press on one must not be
// redirected to the textarea.
const INTERACTIVE_SELECTOR =
	'a[href], button, input, select, textarea, [role="button"]';

export interface ChatInputAreaProps {
	input: string;
	setInput: (value: string) => void;
	onSend: () => void;
	onCancel: () => void;
	isStreaming: boolean;
	isReadOnly?: boolean;
	isEffectivelyDisabled: boolean;
	isSubmitting: boolean;
	projectId?: string;
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInputArea({
	input,
	setInput,
	onSend,
	onCancel,
	isStreaming,
	isReadOnly = false,
	isEffectivelyDisabled,
	isSubmitting,
	projectId,
	inputRef,
}: ChatInputAreaProps) {
	const canFocusFromSurface =
		!isReadOnly && !isStreaming && !isEffectivelyDisabled;

	// The composer is one visual field: pressing its empty padding or footer row
	// focuses the textarea. mousedown (not click) so the browser never parks
	// focus on the wrapper first. Controls keep their own action.
	const focusFromSurface = (event: React.MouseEvent<HTMLDivElement>) => {
		if (!canFocusFromSurface || event.defaultPrevented) return;
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (target.closest(INTERACTIVE_SELECTOR)) return;
		const el = inputRef?.current;
		if (!el) return;
		event.preventDefault();
		el.focus({ preventScroll: true });
		el.setSelectionRange(el.value.length, el.value.length);
	};

	const actionLabel = isStreaming
		? "Hentikan proses"
		: projectId
			? "Update PRD"
			: "Generate PRD";

	return (
		<div className="border-t border-graphite p-4">
			{isReadOnly ? (
				<output
					aria-label="PRD dikunci"
					className="flex items-start gap-3 rounded-md border border-graphite/60 bg-charcoal/80 p-3.5 text-xs text-fog"
				>
					<Icon
						icon={LockKeyIcon}
						size={16}
						className="mt-0.5 shrink-0 text-amber-400"
					/>
					<div className="flex flex-col gap-1">
						<span className="font-[510] text-snow">
							Dokumen PRD Dikunci (Read-Only)
						</span>
						<span className="leading-relaxed text-fog/80">
							Proyek telah mencapai tahap Acceptance Criteria / Task. Dokumen
							PRD tetap dapat dibaca dan diekspor sebagai referensi, namun
							revisi dinonaktifkan untuk menjaga konsistensi alur proyek.
						</span>
					</div>
				</output>
			) : (
				// biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience only; the textarea and button keep native keyboard semantics
				<div
					data-testid="chat-composer"
					onMouseDown={focusFromSurface}
					className="relative flex flex-col rounded-md bg-charcoal shadow-[var(--shadow-inset)] transition-shadow duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:shadow-[inset_0_0_0_1px_rgba(94,106,210,0.85)]"
				>
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== "Enter" || e.shiftKey) return;
							// IME candidate confirmation also reports Enter.
							if (e.nativeEvent.isComposing) return;
							e.preventDefault();
							onSend();
						}}
						placeholder={
							isEffectivelyDisabled
								? "Pilih proyek dari daftar atau buat baru dari beranda"
								: projectId
									? "Ketik pesan atau instruksi revisi PRD..."
									: "Ceritakan ide produkmu..."
						}
						className={cn(
							"w-full resize-none border-none bg-transparent px-3 pb-2 pt-3 text-[14px] text-snow outline-none placeholder:text-slate",
							isEffectivelyDisabled && "cursor-not-allowed opacity-70",
						)}
						style={{
							color: "var(--text-primary)",
							caretColor: "var(--text-primary)",
						}}
						rows={2}
						disabled={isStreaming || isEffectivelyDisabled}
					/>
					<div className="flex items-center justify-end px-3 pb-3 pt-1">
						<button
							type="button"
							onClick={isStreaming ? onCancel : onSend}
							disabled={
								!isStreaming &&
								(!input.trim() || isSubmitting || isEffectivelyDisabled)
							}
							aria-label={actionLabel}
							title={actionLabel}
							className={cn(
								"flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/60 disabled:opacity-30 active:scale-[0.98] max-md:h-11 max-md:w-11",
								isStreaming
									? "bg-crimson text-white hover:bg-crimson/90"
									: "btn-primary hover:brightness-105",
							)}
						>
							<Icon
								icon={isStreaming ? StopIcon : ArrowUp02Icon}
								size={16}
								strokeWidth={2}
							/>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
