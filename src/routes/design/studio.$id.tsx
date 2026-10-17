import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { StudioWorkspace } from "@/features/studio/components/workspace/studio-workspace";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";
import { requireUserServer } from "@/lib/session";

export type { StudioDetailLoaderData } from "@/features/studio/types/studio";

const loadStudioDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<StudioDetailLoaderData> => {
		const user = await requireUserServer();
		const { getStudioProjectDetail } = await import(
			"@/lib/services/studio-service"
		);
		const detail = await getStudioProjectDetail(id, user.id);
		return {
			project: detail.project,
			frames: detail.frames,
			activeJob: detail.activeJob,
			logoUrl: detail.logoUrl,
			revisions: detail.revisions,
			latest: detail.latest,
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
	const initialData = Route.useLoaderData();
	if (!initialData?.project) throw new Error("NOT_FOUND");
	return (
		<StudioWorkspace key={initialData.project.id} initialData={initialData} />
	);
}
