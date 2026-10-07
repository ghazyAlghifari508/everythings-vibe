"use client";

import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, Globe, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DESIGN_ERROR_CODES } from "@/lib/design-errors";

function errorMessage(status: number): string {
	if (status === 400) return DESIGN_ERROR_CODES.INVALID_URL;
	if (status === 502) return DESIGN_ERROR_CODES.WEBSITE_BLOCKED;
	return "Scrape belum bisa diproses. Coba lagi sebentar lagi.";
}

export function HtmlScraper() {
	const navigate = useNavigate();
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!url.trim()) {
			setError("Link wajib diisi.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/scrape", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: url.trim() }),
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
			});
		} catch {
			setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="w-full">
			<form onSubmit={(e) => void submit(e)} className="mx-auto max-w-2xl">
				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="flex h-14 flex-1 items-center gap-3 rounded-xl border border-graphite bg-charcoal px-4 transition-colors focus-within:border-slate">
						<Globe size={20} className="shrink-0 text-fog" aria-hidden="true" />
						<label htmlFor="scrape-url" className="sr-only">
							Website yang ingin di-scrape
						</label>
						<input
							id="scrape-url"
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
							aria-describedby="scrape-help"
							className="h-full min-w-0 flex-1 bg-transparent text-sm text-snow outline-none placeholder:text-fog/70 disabled:opacity-60"
						/>
					</div>

					<button
						type="submit"
						disabled={loading || !url.trim()}
						className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-transparent bg-zinc-900 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
								<span>Scrap website</span>
								<ArrowRight size={18} aria-hidden="true" />
							</>
						)}
					</button>
				</div>

				<div className="mt-3">
					{error ? (
						<p
							id="scrape-help"
							role="alert"
							className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400"
						>
							<AlertCircle size={15} aria-hidden="true" />
							{error}
						</p>
					) : (
						<p
							id="scrape-help"
							className="text-center text-xs text-fog sm:text-left"
						>
							Website publik · Preview HTML · DESIGN.md
						</p>
					)}
				</div>
			</form>
		</div>
	);
}
