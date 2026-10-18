// Project history reads/writes for the workspace UI: append-only document
// version history (PRD, AC) and the last-visited route.
//
// Ownership reuses the shared project predicate (`WHERE id = ? AND user_id = ?
// AND deleted_at IS NULL`) so a foreign or deleted project never resolves.
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { acVersions, prdVersions, projects } from "@/db/schema";
import { verifyProjectOwnership } from "@/lib/api-key-auth";

export interface DocumentVersionRow {
	id: string;
	version: number;
	content: string;
	change_summary: string | null;
	created_at: Date | null;
}

export type DocumentVersionHistory = DocumentVersionRow[];

export async function getPrdVersionHistory(
	projectId: string,
	userId: string,
): Promise<DocumentVersionHistory | null> {
	if (!(await verifyProjectOwnership(userId, projectId))) return null;
	return db
		.select({
			id: prdVersions.id,
			version: prdVersions.version,
			content: prdVersions.content,
			change_summary: prdVersions.changeSummary,
			created_at: prdVersions.createdAt,
		})
		.from(prdVersions)
		.where(eq(prdVersions.projectId, projectId))
		.orderBy(desc(prdVersions.version));
}

export async function getAcVersionHistory(
	projectId: string,
	userId: string,
): Promise<DocumentVersionHistory | null> {
	if (!(await verifyProjectOwnership(userId, projectId))) return null;
	return db
		.select({
			id: acVersions.id,
			version: acVersions.version,
			content: acVersions.content,
			change_summary: acVersions.changeSummary,
			created_at: acVersions.createdAt,
		})
		.from(acVersions)
		.where(eq(acVersions.projectId, projectId))
		.orderBy(desc(acVersions.version));
}

// Returns false when the project is missing, foreign, or deleted.
export async function setProjectLastUrl(
	projectId: string,
	userId: string,
	url: string,
): Promise<boolean> {
	if (!(await verifyProjectOwnership(userId, projectId))) return false;
	await db
		.update(projects)
		.set({ lastUrl: url, updatedAt: new Date() })
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		);
	return true;
}
