import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { useEffect } from "react";
import { FiturDetail } from "@/components/fitur/fitur-detail";
import { db } from "@/db";
import type { ProjectFeatureTree } from "@/db/schema";
import { projects } from "@/db/schema";
import { requireUserServer } from "@/lib/session";
import { useLastRoute } from "@/lib/use-last-route";

// ponytail: server-only db logic - loader runs on client too, must not import db there.
const loadFitur = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const [project] = await db
			.select({
				id: projects.id,
				name: projects.name,
				step: projects.step,
				featuresStatus: projects.featuresStatus,
				featureTree: projects.featureTree,
			})
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);

		if (!project) throw new Error("NOT_FOUND");
		const featureTree: ProjectFeatureTree | null = project.featureTree ?? null;
		return {
			projectId: id,
			projectName: project.name,
			step: project.step ?? null,
			featuresStatus: project.featuresStatus ?? "pending",
			featureTree,
		};
	});

export const Route = createFileRoute("/fitur/$id")({
	loader: async ({ params }) => {
		try {
			return await loadFitur({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: `${loaderData?.projectName ?? "Fitur"} - Fitur` }],
	}),
	component: FiturPage,
	errorComponent: () => (
		<div className="p-10 text-center text-fog">
			Daftar fitur tidak ditemukan.
		</div>
	),
});

function FiturPage() {
	const d = Route.useLoaderData();
	const pathname = useLocation({ select: (l) => l.pathname });
	const reportLastRoute = useLastRoute(d.projectId);

	useEffect(() => {
		reportLastRoute(pathname);
	}, [pathname, reportLastRoute]);
	return (
		<FiturDetail
			projectId={d.projectId}
			projectName={d.projectName}
			featureTree={d.featureTree}
			featuresStatus={d.featuresStatus}
			step={d.step}
		/>
	);
}
