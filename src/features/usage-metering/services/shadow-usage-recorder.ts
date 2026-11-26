import type { InsertShadowUsageRow } from "@/db/schema";
import type { ShadowUsageInput } from "../types/shadow-usage";
import {
	buildShadowUsageEvent,
	buildShadowUsageInsert,
} from "./shadow-usage-record";

/** Returns false when the (user, dedupe key) pair already exists. */
export interface ShadowUsagePersistence {
	insert(row: InsertShadowUsageRow): Promise<boolean>;
}

/**
 * Database sink. The unique index is the idempotency guarantee, so a repeated
 * delivery of one attempt can never inflate logical-operation totals.
 */
export async function createDbShadowUsagePersistence(): Promise<ShadowUsagePersistence> {
	const { db } = await import("@/db");
	const { shadowUsageRecords } = await import("@/db/schema");
	return {
		async insert(row) {
			const inserted = await db
				.insert(shadowUsageRecords)
				.values(row)
				.onConflictDoNothing({
					target: [shadowUsageRecords.userId, shadowUsageRecords.dedupeKey],
				})
				.returning({ id: shadowUsageRecords.id });
			return inserted.length > 0;
		},
	};
}

/**
 * Observational only: no credit table, no trial state, no charge record.
 * Telemetry failures are reported by error name alone and never thrown, so
 * losing a measurement cannot break the operation being measured.
 */
export async function recordShadowUsage(
	input: ShadowUsageInput,
	persistence?: ShadowUsagePersistence,
): Promise<boolean> {
	try {
		const event = buildShadowUsageEvent(input);
		const row = buildShadowUsageInsert(event);
		const sink = persistence ?? (await createDbShadowUsagePersistence());
		return await sink.insert(row);
	} catch (error) {
		console.error(
			JSON.stringify({
				scope: "shadow-usage",
				level: "error",
				message: "Shadow metering failed",
				code: error instanceof Error ? error.name : "UNKNOWN",
			}),
		);
		return false;
	}
}
