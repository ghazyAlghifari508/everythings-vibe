import { type AnyColumn, sql } from "drizzle-orm";

export async function getDatabase() {
	const { db } = await import("@/db");
	const schema = await import("@/db/schema");
	return { db, schema };
}

export function orValidPeriod(period: AnyColumn) {
	return sql`(${period} IS NULL OR ${period} >= now())`;
}

export type CreditTransaction = Parameters<
	Parameters<Awaited<ReturnType<typeof getDatabase>>["db"]["transaction"]>[0]
>[0];
