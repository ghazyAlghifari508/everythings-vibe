// Project history is read by the /history route AND by the client history
// drawer, so this module must stay client-safe: the createServerFn compiler
// strips the handler body from the browser bundle, which is why db/pg are
// dynamic-imported inside the handler rather than at module scope. The
// ownership boundary lives here so every history read shares one filter.
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUserServer } from "@/lib/session";

export interface HistoryItem {
	id: string;
	name: string;
	step: string | null;
	lastUrl: string | null;
	updatedAt: Date;
	preview: string | null;
	acStatus: string | null;
	taskStatus: string | null;
}

export const loadHistory = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");

		const projectRows = await db
			.select({
				id: projects.id,
				name: projects.name,
				step: projects.step,
				lastUrl: projects.lastUrl,
				updatedAt: projects.updatedAt,
				acStatus: projects.acStatus,
				taskStatus: projects.taskStatus,
				description: projects.description,
			})
			.from(projects)
			.where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
			.orderBy(desc(projects.updatedAt));

		// ponytail: preview is the AI-written project summary (projects.description,
		// written fire-and-forget after PRD generate). Legacy rows pre-dating the
		// summary feature have no description — card renders without a preview
		// line rather than re-introducing the full prd_versions content fetch.
		const items: HistoryItem[] = projectRows.map((p) => ({
			id: p.id,
			name: p.name,
			step: p.step,
			lastUrl: p.lastUrl,
			updatedAt: p.updatedAt ?? new Date(0),
			preview: p.description,
			acStatus: p.acStatus,
			taskStatus: p.taskStatus,
		}));

		return { items };
	},
);
