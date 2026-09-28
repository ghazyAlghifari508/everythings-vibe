import { useNavigate } from "@tanstack/react-router";
import { Globe, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DESIGN_ERROR_CODES } from "@/lib/design-errors";

export interface ScrapeHistoryItem {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	status: string;
	createdAt: string;
}

function errorMessage(status: number): string {
	if (status === 400) return DESIGN_ERROR_CODES.INVALID_URL;
	if (status === 502) return DESIGN_ERROR_CODES.WEBSITE_BLOCKED;
	return "Scrape gagal. Coba lagi sebentar lagi.";
}

export function HtmlScraper({ history }: { history: ScrapeHistoryItem[] }) {
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
		<div className="flex w-full flex-col gap-6">
			<form
				onSubmit={(e) => void submit(e)}
				className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-5"
			>
				<label htmlFor="scrape-url" className="text-sm font-semibold text-snow">
					URL website live
				</label>
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						id="scrape-url"
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://contoh.co.id"
						disabled={loading}
						className="flex-1 rounded-lg border border-graphite bg-onyx px-3 py-2 text-sm text-snow placeholder:text-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={loading || !url.trim()}
						className="inline-flex items-center justify-center gap-1.5 rounded-full bg-snow px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-mist disabled:opacity-50"
					>
						{loading ? (
							<Loader2 size={16} aria-hidden className="animate-spin" />
						) : (
							<Globe size={16} aria-hidden />
						)}
						{loading ? "Menyerap…" : "Scrap Sekarang"}
					</button>
				</div>
				{error ? (
					<p role="alert" className="text-xs text-red-400">
						{error}
					</p>
				) : (
					<p className="text-xs leading-5 text-fog">
						Hasil langsung 2 file: index.html (preview desktop 1440px) dan
						design.md (token visual, komponen, do dan don&apos;t).
					</p>
				)}
			</form>

			<section className="flex flex-col gap-2">
				<h2 className="font-mono text-xs uppercase tracking-widest text-fog">
					Riwayat scrape
				</h2>
				{history.length === 0 ? (
					<div className="rounded-xl border border-dashed border-graphite/60 bg-charcoal/40 p-6 text-center">
						<p className="text-sm font-semibold text-mist">
							Belum ada scrape. Masukkan URL di atas untuk mulai.
						</p>
						<p className="mt-1 text-xs leading-5 text-fog">
							Contoh: landing page produk, situs portofolio, atau halaman
							pricing favoritmu.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{history.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() =>
										void navigate({
											to: "/design/scrap/$id",
											params: { id: item.id },
										})
									}
									className="flex w-full items-center justify-between gap-3 rounded-lg border border-graphite bg-charcoal p-3 text-left transition-colors hover:bg-onyx"
								>
									<span className="min-w-0">
										<span className="block truncate text-sm font-semibold text-snow">
											{item.title || item.domain}
										</span>
										<span className="block truncate font-mono text-[11px] text-fog">
											{item.sourceUrl}
										</span>
									</span>
									<span className="shrink-0 rounded-md border border-graphite bg-onyx px-2 py-0.5 font-mono text-[11px] text-fog">
										{item.status}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
