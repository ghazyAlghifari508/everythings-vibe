"use client";

import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, Globe, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DESIGN_ERROR_CODES } from "@/lib/design-errors";
import { SCRAPE_RETURN_FALLBACK } from "@/lib/scrape-return-path";

function errorMessage(status: number): string {
	if (status === 400) return DESIGN_ERROR_CODES.INVALID_URL;
	if (status === 502) return DESIGN_ERROR_CODES.WEBSITE_BLOCKED;
	return "Scrape belum bisa diproses. Coba lagi sebentar lagi.";
}

export function DesignGeneratorPanel() {
	const navigate = useNavigate();
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed) {
			setError("Link wajib diisi.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/scrape", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: trimmed, mode: "design" }),
			});
			const data = (await res.json().catch(() => null)) as {
				scrapeId?: string;
				error?: string;
			} | null;
			if (!res.ok || !data?.scrapeId) {
				setError(data?.error ?? errorMessage(res.status));
				return;
			}
			void navigate({
				to: "/design/scrap/$id",
				params: { id: data.scrapeId },
				search: { from: SCRAPE_RETURN_FALLBACK },
			});
		} catch {
			setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="w-full">
			<form
				onSubmit={(e) => void submit(e)}
				className="mx-auto w-full max-w-2xl"
			>
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="flex h-14 min-h-[56px] w-full items-center gap-3 rounded-xl border border-graphite bg-charcoal px-4 transition-all focus-within:border-slate focus-within:ring-1 focus-within:ring-slate/20 sm:h-14 sm:flex-1">
						<Globe size={20} className="shrink-0 text-fog" aria-hidden="true" />
						<label htmlFor="design-url" className="sr-only">
							Website yang ingin di-generate DESIGN.md
						</label>
						<input
							id="design-url"
							type="url"
							inputMode="url"
							autoComplete="url"
							name="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://example.com"
							disabled={loading}
							required
							aria-invalid={!!error}
							aria-describedby="design-help"
							className="h-full min-w-0 flex-1 bg-transparent text-base sm:text-sm font-medium text-snow outline-none placeholder:text-fog/70 disabled:opacity-60 [--autofill-bg:var(--color-charcoal)]"
						/>
					</div>

					<button
						type="submit"
						disabled={loading || !url.trim()}
						className="inline-flex h-14 min-h-[56px] sm:h-14 w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl border border-transparent bg-zinc-900 px-6 text-base sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
					>
						{loading ? (
							<>
								<Loader2
									size={18}
									className="animate-spin"
									aria-hidden="true"
								/>
								<span>Menyiapkan…</span>
							</>
						) : (
							<>
								<span>Buat DESIGN.md</span>
								<ArrowRight size={18} aria-hidden="true" />
							</>
						)}
					</button>
				</div>

				<div className="mt-3">
					{error ? (
						<p
							id="design-help"
							role="alert"
							className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400"
						>
							<AlertCircle size={15} aria-hidden="true" />
							{error}
						</p>
					) : (
						<p
							id="design-help"
							className="text-center text-xs text-fog sm:text-left"
						>
							Website publik · DESIGN.md untuk AI coding
						</p>
					)}
				</div>
			</form>
		</div>
	);
}
