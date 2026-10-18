import { createServerFn } from "@tanstack/react-start";
import { getUserPlanAndQuota, requireUserServer } from "@/lib/session";
import type { Plan, PrdVersion } from "@/types/database";

export interface PrdChatMessage {
	id: string;
	role: string;
	content: string;
	created_at: string;
}

export interface PrdLoaderData {
	projectId: string;
	projectName: string;
	step: string | null;
	latestVersion?: PrdVersion;
	allVersions: PrdVersion[];
	conversationId?: string;
	plan: Plan;
	revisionLimit?: number;
	initialMessages: PrdChatMessage[];
}

interface PrdVersionRow {
	id: string;
	projectId: string;
	version: number;
	content: string;
	changeSummary: string | null;
	createdAt: Date | null;
}

// PrdVersion is the client wire shape: snake_case keys and ISO timestamps.
// prd_versions has no storage path column (content lives in the row), so
// storage_path is always null.
function toPrdVersion(row: PrdVersionRow): PrdVersion {
	return {
		id: row.id,
		project_id: row.projectId,
		version: row.version,
		content: row.content,
		storage_path: null,
		change_summary: row.changeSummary,
		created_at: row.createdAt?.toISOString() ?? "",
	};
}

// ponytail: requireUserServer is a server fn → its auth/db imports get pruned
// from the client bundle. Plain `requireUser` would drag pg (→ Buffer) in.
export const loadPrd = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<PrdLoaderData> => {
		const user = await requireUserServer();
		const { plan, quota } = await getUserPlanAndQuota();
		const { db } = await import("@/db");
		const { conversations, messages, prdVersions, projects } = await import(
			"@/db/schema"
		);
		const { and, asc, desc, eq, isNull } = await import("drizzle-orm");

		const [projectRows, versionRows, convRows] = await Promise.all([
			db
				.select({ id: projects.id, name: projects.name, step: projects.step })
				.from(projects)
				.where(
					and(
						eq(projects.id, id),
						eq(projects.userId, user.id),
						isNull(projects.deletedAt),
					),
				)
				.limit(1),
			db
				.select({
					id: prdVersions.id,
					projectId: prdVersions.projectId,
					version: prdVersions.version,
					content: prdVersions.content,
					changeSummary: prdVersions.changeSummary,
					createdAt: prdVersions.createdAt,
				})
				.from(prdVersions)
				.where(eq(prdVersions.projectId, id))
				.orderBy(desc(prdVersions.version)),
			db
				.select({ id: conversations.id })
				.from(conversations)
				.where(eq(conversations.projectId, id))
				.orderBy(desc(conversations.createdAt))
				.limit(1),
		]);

		const project = projectRows[0];
		if (!project) throw new Error("NOT_FOUND");

		let initialMessages: PrdChatMessage[] = [];
		const conv = convRows[0];
		if (conv) {
			const msgs = await db
				.select({
					id: messages.id,
					role: messages.role,
					content: messages.content,
					createdAt: messages.createdAt,
				})
				.from(messages)
				.where(eq(messages.conversationId, conv.id))
				.orderBy(asc(messages.createdAt))
				.limit(200);
			initialMessages = msgs.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				created_at: m.createdAt?.toISOString() ?? "",
			}));
		}

		const allVersions = versionRows.map(toPrdVersion);
		const latestVersion = allVersions[0];

		return {
			projectId: id,
			projectName: project.name,
			step: project.step ?? null,
			...(latestVersion ? { latestVersion } : {}),
			allVersions,
			...(conv?.id ? { conversationId: conv.id } : {}),
			plan,
			...(quota?.revisionLimit != null
				? { revisionLimit: quota.revisionLimit }
				: {}),
			initialMessages,
		};
	});
