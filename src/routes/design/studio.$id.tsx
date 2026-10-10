import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { type FormEvent, useState } from "react";
import { StudioCanvas } from "@/components/design/studio-canvas";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { requireUserServer } from "@/lib/session";

const loadStudioDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getStudioProject } = await import("@/lib/services/studio-service");
		const project = await getStudioProject(id, user.id);
		return {
			id: project.id,
			title: project.title,
			designMode: project.designMode,
			hasDesignMd: Boolean(project.designMd),
			hasLogo: Boolean(project.logoAssetId),
			latestHtml: project.latest?.htmlCode ?? "",
			latestVersion: project.latest?.version ?? 0,
			revisionCount: project.revisions.length,
		};
	});

export const Route = createFileRoute("/design/studio/$id")({
	head: () => ({
		meta: [{ title: "Studio Canvas | VibeDesign" }],
	}),
	loader: async ({ params }) => {
		try {
			return await loadStudioDetail({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				const { redirect } = await import("@tanstack/react-router");
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: StudioDetailPage,
	errorComponent: () => (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
			<p className="rounded-xl border border-graphite bg-charcoal p-8 text-center text-sm text-mist">
				Studio tidak ditemukan atau gagal dimuat.
			</p>
		</main>
	),
});

function StudioDetailPage() {
	const detail = Route.useLoaderData();
	if (!detail) throw new Error("NOT_FOUND");
	const [revision, setRevision] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [htmlCode, setHtmlCode] = useState(detail.latestHtml);
	const [version, setVersion] = useState(detail.latestVersion);

	async function submitRevision(e: FormEvent) {
		e.preventDefault();
		if (!revision.trim()) return;
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/studio/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: detail.id,
					prompt: revision.trim(),
				}),
			});
			const data = (await res.json().catch(() => null)) as {
				htmlCode?: string;
				version?: number;
				error?: string;
			} | null;
			if (!res.ok || !data?.htmlCode) {
				setError(data?.error ?? "Revisi gagal. Coba lagi.");
				return;
			}
			setHtmlCode(data.htmlCode);
			if (typeof data.version === "number") setVersion(data.version);
			setRevision("");
		} catch {
			setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current={detail.title} />
			<Link
				to="/design/studio"
				className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
			>
				<ArrowLeft size={16} aria-hidden />
				Kembali ke studio
			</Link>
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight text-snow">
						{detail.title}
					</h1>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<span className="font-mono text-xs text-fog">
							v{version} · {detail.revisionCount} revisi
						</span>
						<span className="font-mono text-[10px] uppercase tracking-wider rounded border border-graphite bg-onyx px-1.5 py-0.5 text-fog">
							{detail.designMode === "mobile" ? "Mobile" : "Web"}
						</span>
						{detail.hasDesignMd && (
							<span className="font-mono text-[10px] rounded border border-graphite bg-onyx px-1.5 py-0.5 text-mist">
								DESIGN.md
							</span>
						)}
						{detail.hasLogo && (
							<span className="font-mono text-[10px] rounded border border-graphite bg-onyx px-1.5 py-0.5 text-mist">
								Logo
							</span>
						)}
					</div>
				</div>
			</header>

			{htmlCode ? (
				<StudioCanvas
					title={detail.title}
					htmlCode={htmlCode}
					version={version}
					initialViewport={
						detail.designMode === "mobile" ? "mobile" : "desktop"
					}
				/>
			) : (
				<div className="rounded-xl border border-graphite bg-charcoal p-8 text-center">
					<p className="text-sm font-semibold text-mist">
						Project ini belum punya revisi.
					</p>
				</div>
			)}

			<form
				onSubmit={(e) => void submitRevision(e)}
				className="sticky bottom-4 flex flex-col gap-2 rounded-xl border border-graphite bg-charcoal p-4"
			>
				<label
					htmlFor="studio-revision"
					className="font-mono text-[11px] uppercase tracking-widest text-fog"
				>
					Revisi iteratif
				</label>
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						id="studio-revision"
						value={revision}
						onChange={(e) => setRevision(e.target.value)}
						placeholder="Contoh: ubah warna tombol jadi hijau, tambahkan tabel riwayat…"
						disabled={loading}
						className="flex-1 rounded-lg border border-graphite bg-onyx px-3 py-2 text-sm text-snow placeholder:text-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
					/>
					<button
						type="submit"
						disabled={loading || !revision.trim()}
						className="inline-flex items-center justify-center gap-1.5 rounded-full bg-snow px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-mist disabled:opacity-50"
					>
						{loading ? (
							<Loader2 size={16} aria-hidden className="animate-spin" />
						) : (
							<Send size={16} aria-hidden />
						)}
						{loading ? "Merevisi…" : "Kirim revisi"}
					</button>
				</div>
				{error ? (
					<p role="alert" className="text-xs text-red-400">
						{error}
					</p>
				) : null}
			</form>
		</main>
	);
}
