import { Loader2, Palette, Plus, Sparkles, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

export interface StudioComposerProps {
	selectedFrameName?: string | null;
	onClearSelectedFrame?: () => void;
	onSubmit: (prompt: string) => Promise<void> | void;
	loading?: boolean;
	className?: string;
}

export function StudioComposer({
	selectedFrameName,
	onClearSelectedFrame,
	onSubmit,
	loading = false,
	className = "",
}: StudioComposerProps) {
	const [prompt, setPrompt] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = prompt.trim();
		if (!trimmed || loading) return;
		await onSubmit(trimmed);
		setPrompt("");
	}

	function applyPreset(text: string) {
		setPrompt(text);
		inputRef.current?.focus();
	}

	return (
		<div
			className={`fixed bottom-6 left-1/2 z-30 w-full max-w-2xl -translate-x-1/2 px-4 transition-all ${className}`}
		>
			<form
				onSubmit={(e) => void handleSubmit(e)}
				className="flex flex-col gap-2 rounded-2xl border border-graphite bg-[#121215]/95 p-3 text-snow shadow-2xl backdrop-blur-md transition-all focus-within:border-steel focus-within:ring-2 focus-within:ring-indigo-500/30"
			>
				{/* Top Status & Context Pill */}
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite/40 pb-2">
					<div className="flex items-center gap-1.5">
						{selectedFrameName ? (
							<span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
								<span>Editing: {selectedFrameName}</span>
								{onClearSelectedFrame && (
									<button
										type="button"
										onClick={onClearSelectedFrame}
										aria-label="Beralih ke seluruh project"
										className="rounded-full p-0.5 hover:bg-indigo-500/30 hover:text-snow focus:outline-none"
									>
										<X size={12} aria-hidden />
									</button>
								)}
							</span>
						) : (
							<span className="inline-flex items-center rounded-full border border-graphite bg-onyx px-2.5 py-0.5 text-xs font-semibold text-fog">
								Seluruh Project
							</span>
						)}
					</div>

					{/* Quick Action Suggestion Chips */}
					<div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
						<button
							type="button"
							onClick={() => applyPreset("Tambahkan halaman ")}
							className="inline-flex items-center gap-1 rounded-full border border-graphite/60 bg-onyx/80 px-2.5 py-0.5 text-fog transition-colors hover:border-graphite hover:text-snow"
						>
							<Plus size={11} />
							<span>+ Tambah Halaman</span>
						</button>
						<button
							type="button"
							onClick={() => applyPreset("Ubah tema dan warna menjadi ")}
							className="inline-flex items-center gap-1 rounded-full border border-graphite/60 bg-onyx/80 px-2.5 py-0.5 text-fog transition-colors hover:border-graphite hover:text-snow"
						>
							<Palette size={11} />
							<span>Ubah Tema</span>
						</button>
					</div>
				</div>

				{/* Input bar */}
				<div className="flex items-center gap-2 pt-0.5">
					<input
						ref={inputRef}
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder={
							selectedFrameName
								? `Minta perubahan khusus untuk layar ${selectedFrameName}...`
								: "Minta AI menambah halaman atau merevisi UI..."
						}
						disabled={loading}
						className="flex-1 bg-transparent px-2 text-sm text-snow placeholder:text-fog focus:outline-none disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={loading || !prompt.trim()}
						aria-label="Kirim prompt"
						className="inline-flex items-center justify-center gap-1.5 rounded-full bg-snow px-4 py-1.5 text-xs font-semibold text-ink transition-all hover:bg-mist active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{loading ? (
							<Loader2 size={13} className="animate-spin" aria-hidden />
						) : (
							<Sparkles size={13} aria-hidden />
						)}
						<span className="hidden sm:inline">
							{loading ? "Memproses..." : "Kirim"}
						</span>
					</button>
				</div>
			</form>
		</div>
	);
}
