import { LockKeyIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

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
				<div className="relative flex flex-col rounded-md bg-charcoal shadow-[var(--shadow-inset)] transition-shadow duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:shadow-[inset_0_0_0_1px_rgba(94,106,210,0.85)]">
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								onSend();
							}
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
					<div className="flex items-center justify-between px-3 pb-3 pt-1">
						<button
							type="button"
							onClick={isStreaming ? onCancel : onSend}
							disabled={
								!isStreaming &&
								(!input.trim() || isSubmitting || isEffectivelyDisabled)
							}
							className={cn(
								"flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-30 active:scale-[0.98]",
								isStreaming
									? "bg-crimson text-white hover:bg-crimson/90"
									: "btn-primary hover:brightness-105",
							)}
							title={
								isStreaming
									? "Hentikan Proses"
									: projectId
										? "Update PRD"
										: "Generate PRD"
							}
						>
							{isStreaming ? (
								<svg
									aria-hidden="true"
									width="12"
									height="12"
									viewBox="0 0 16 16"
									fill="currentColor"
								>
									<rect x="3" y="3" width="10" height="10" rx="1" />
								</svg>
							) : (
								<svg
									width="14"
									height="14"
									viewBox="0 0 16 16"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M2 8L14 8M10 4L14 8L10 12"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
