import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { ScrapeDetail } from "@/components/design/scrape-detail";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { requireUserServer } from "@/lib/session";

const loadScrapeDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getScrapeById } = await import("@/lib/services/scrape-service");
		const scrape = await getScrapeById(id, user.id);
		return {
			sourceUrl: scrape.sourceUrl,
			domain: scrape.domain,
			title: scrape.title,
			status: scrape.status,
			previewHtml: scrape.previewHtml ?? "",
			designMd: scrape.document?.designMd ?? "",
			capturedAt:
				scrape.metadata &&
				typeof scrape.metadata === "object" &&
				"capturedAt" in scrape.metadata &&
				typeof scrape.metadata.capturedAt === "string"
					? scrape.metadata.capturedAt
					: scrape.createdAt.toISOString(),
		};
	});

export const Route = createFileRoute("/design/scrap/$id")({
	head: () => ({
		meta: [{ title: "Hasil Scrape | VibeDesign" }],
	}),
	loader: async ({ params }) => {
		try {
			return await loadScrapeDetail({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				const { redirect } = await import("@tanstack/react-router");
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: ScrapeDetailPage,
	errorComponent: () => (
		<main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
			<p className="rounded-xl border border-graphite bg-charcoal p-8 text-center text-sm text-mist">
				Scrape tidak ditemukan atau gagal dimuat.
			</p>
		</main>
	),
});

function ScrapeDetailPage() {
	const detail = Route.useLoaderData();
	if (!detail) throw new Error("NOT_FOUND");
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current={detail.title || detail.domain} />
			<Link
				to="/design/scrap"
				className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
			>
				<ArrowLeft size={16} aria-hidden />
				Kembali ke scraper
			</Link>
			<header className="max-w-2xl">
				<h1 className="text-3xl font-semibold tracking-tight text-snow">
					{detail.title || detail.domain}
				</h1>
				<p className="mt-2 font-mono text-xs text-fog">
					Status: {detail.status}
				</p>
			</header>
			{detail.previewHtml && detail.designMd ? (
				<ScrapeDetail
					sourceUrl={detail.sourceUrl}
					domain={detail.domain}
					previewHtml={detail.previewHtml}
					designMd={detail.designMd}
					capturedAt={detail.capturedAt}
				/>
			) : (
				<div className="rounded-xl border border-graphite bg-charcoal p-8 text-center">
					<p className="text-sm font-semibold text-mist">
						Scrape ini belum selesai diproses.
					</p>
					<p className="mt-1 text-xs leading-5 text-fog">
						Status saat ini: {detail.status}. Tunggu beberapa saat lalu muat
						ulang halaman.
					</p>
				</div>
			)}
		</main>
	);
}
