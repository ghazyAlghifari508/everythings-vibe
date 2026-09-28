import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { requireUserServer } from "@/lib/session";

const loadStudioHistory = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { listStudioProjects } = await import(
			"@/lib/services/studio-service"
		);
		const rows = await listStudioProjects(user.id);
		return {
			history: rows.map((row) => ({
				id: row.id,
				title: row.title,
				createdAt: row.createdAt.toISOString(),
			})),
		};
	},
);

export const Route = createFileRoute("/design/studio/")({
	head: () => ({
		meta: [{ title: "Prompt UI Studio | VibeDesign" }],
	}),
	loader: async () => loadStudioHistory(),
	component: StudioPage,
});

function StudioPage() {
	const { history } = Route.useLoaderData();
	const navigate = useNavigate();
	const [prompt, setPrompt] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!prompt.trim()) {
			setError("Ceritakan UI yang mau dibuat dulu.");
			return;
		}
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/studio/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: prompt.trim() }),
			});
			const data = (await res.json().catch(() => null)) as {
				projectId?: string;
				error?: string;
			} | null;
			if (!res.ok || !data?.projectId) {
				setError(data?.error ?? "Studio gagal generate. Coba lagi.");
				return;
			}
			void navigate({
				to: "/design/studio/$id",
				params: { id: data.projectId },
			});
		} catch {
			setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="Prompt UI Studio" />
			<header className="max-w-2xl">
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Rancang UI dari prompt teks
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Tulis kebutuhan antarmukamu dalam Bahasa Indonesia. Studio
					men-generate halaman HTML interaktif lengkap dengan Tailwind dan data
					realistis, siap direvisi lewat chat.
				</p>
			</header>

			<form
				onSubmit={(e) => void submit(e)}
				className="flex flex-col gap-3 rounded-xl border border-graphite bg-charcoal p-5"
			>
				<label
					htmlFor="studio-prompt"
					className="text-sm font-semibold text-snow"
				>
					Prompt UI
				</label>
				<textarea
					id="studio-prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Contoh: landing page SIMRS dengan hero, tabel riwayat transaksi, dan form pendaftaran pasien…"
					rows={4}
					disabled={loading}
					className="rounded-lg border border-graphite bg-onyx px-3 py-2 text-sm leading-6 text-snow placeholder:text-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
				/>
				{error ? (
					<p role="alert" className="text-xs text-red-400">
						{error}
					</p>
				) : null}
				<div>
					<button
						type="submit"
						disabled={loading || !prompt.trim()}
						className="inline-flex items-center justify-center gap-1.5 rounded-full bg-snow px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-mist disabled:opacity-50"
					>
						{loading ? (
							<Loader2 size={16} aria-hidden className="animate-spin" />
						) : (
							<Sparkles size={16} aria-hidden />
						)}
						{loading ? "Menggenerate…" : "Generate UI"}
					</button>
				</div>
			</form>

			<section className="flex flex-col gap-2">
				<h2 className="font-mono text-xs uppercase tracking-widest text-fog">
					Riwayat studio
				</h2>
				{history.length === 0 ? (
					<div className="rounded-xl border border-dashed border-graphite/60 bg-charcoal/40 p-6 text-center">
						<p className="text-sm font-semibold text-mist">
							Belum ada project studio. Tulis prompt di atas untuk mulai.
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
											to: "/design/studio/$id",
											params: { id: item.id },
										})
									}
									className="flex w-full items-center justify-between gap-3 rounded-lg border border-graphite bg-charcoal p-3 text-left transition-colors hover:bg-onyx"
								>
									<span className="truncate text-sm font-semibold text-snow">
										{item.title}
									</span>
									<span className="shrink-0 font-mono text-[11px] text-fog">
										{new Date(item.createdAt).toLocaleDateString("id-ID")}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}
