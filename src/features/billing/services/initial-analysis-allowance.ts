import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
	codebaseAnalyses,
	creditOperations,
	projects,
	users,
} from "@/db/schema";

type Database = Pick<typeof db, "select">;

export async function readInitialAnalysisAllowance(
	database: Database,
	userId: string,
) {
	const [account] = await database
		.select({ usedAt: users.initialAnalysisUsedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const [successful] = await database
		.select({ id: codebaseAnalyses.id })
		.from(codebaseAnalyses)
		.innerJoin(projects, eq(codebaseAnalyses.projectId, projects.id))
		.where(
			and(eq(projects.userId, userId), eq(codebaseAnalyses.status, "ready")),
		)
		.limit(1);
	const [active] = await database
		.select({ id: creditOperations.id })
		.from(creditOperations)
		.where(
			and(
				eq(creditOperations.userId, userId),
				eq(creditOperations.initialAnalysisAllowance, true),
				inArray(creditOperations.state, ["reserved", "running", "settling"]),
			),
		)
		.limit(1);
	return {
		used: !account || account.usedAt !== null || Boolean(successful),
		inProgress: Boolean(active),
	};
}

export async function lockInitialAnalysisAccount(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	userId: string,
) {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`initial-analysis:${userId}`}))`,
	);
}
