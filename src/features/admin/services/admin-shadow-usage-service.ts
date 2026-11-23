import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { shadowUsageRecords } from "@/db/schema/usage-metering";
import {
	type BenchmarkRecord,
	buildBenchmarkReport,
} from "@/features/usage-metering/services/shadow-usage-report";
import {
	SHADOW_OUTCOMES,
	shadowCostBreakdownSchema,
	shadowProviderUsageSchema,
	shadowResourceMetricsSchema,
} from "@/features/usage-metering/types/shadow-usage";
import { requireAdmin } from "@/lib/session";
import { adminDb } from "./admin-db";

const benchmarkFilterSchema = z
	.object({
		productFamily: z.enum(["studio", "scrape"]).optional(),
		operationKind: z.string().min(1).max(80).optional(),
		from: z.string().datetime().optional(),
		to: z.string().datetime().optional(),
		limit: z.number().int().min(1).max(2000).default(500),
	})
	.strict();

const benchmarkRowSchema = z.object({
	operationKind: z.string(),
	outcome: z.enum(SHADOW_OUTCOMES),
	durationMs: z.number(),
	retryCount: z.number(),
	completedUnits: z.number(),
	requestedUnits: z.number().nullable(),
	cost: shadowCostBreakdownSchema,
	providerUsage: shadowProviderUsageSchema.nullable(),
	metrics: shadowResourceMetricsSchema.nullable(),
});

export interface ShadowUsageBenchmarkResponse {
	generatedAt: string;
	sampledRecords: number;
	groups: ReturnType<typeof buildBenchmarkReport>;
	unmeasuredComponents: string[];
}

/** Admin-only aggregate. No prompts, URLs, headers, or artifact bytes exposed. */
export const getShadowUsageBenchmark = createServerFn({ method: "GET" })
	.validator((data: unknown) => benchmarkFilterSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db } = await adminDb();
		const conditions = [
			gte(
				shadowUsageRecords.recordedAt,
				data.from ? new Date(data.from) : new Date(0),
			),
		];
		if (data.to)
			conditions.push(lte(shadowUsageRecords.recordedAt, new Date(data.to)));
		if (data.productFamily)
			conditions.push(
				// Column is stored as text; family is allowlisted by Zod above.
				eq(shadowUsageRecords.productFamily, data.productFamily),
			);
		if (data.operationKind)
			conditions.push(eq(shadowUsageRecords.operationKind, data.operationKind));

		const rows = await db
			.select({
				operationKind: shadowUsageRecords.operationKind,
				outcome: shadowUsageRecords.outcome,
				durationMs: shadowUsageRecords.durationMs,
				retryCount: shadowUsageRecords.retryCount,
				completedUnits: shadowUsageRecords.completedUnits,
				requestedUnits: shadowUsageRecords.requestedUnits,
				cost: shadowUsageRecords.cost,
				providerUsage: shadowUsageRecords.providerUsage,
				metrics: shadowUsageRecords.metrics,
			})
			.from(shadowUsageRecords)
			.where(and(...conditions))
			.orderBy(desc(shadowUsageRecords.recordedAt))
			.limit(data.limit);

		const records: BenchmarkRecord[] = rows.flatMap((row) => {
			const parsed = benchmarkRowSchema.safeParse(row);
			if (!parsed.success) return [];
			return [
				{
					operationKind: parsed.data.operationKind,
					outcome: parsed.data.outcome,
					durationMs: parsed.data.durationMs,
					retryCount: parsed.data.retryCount,
					completedUnits: parsed.data.completedUnits,
					requestedUnits: parsed.data.requestedUnits,
					cost: parsed.data.cost,
					providerUsage: parsed.data.providerUsage,
					metrics: parsed.data.metrics ?? {
						measurementScope: "operation",
					},
				},
			];
		});

		return {
			generatedAt: new Date().toISOString(),
			sampledRecords: records.length,
			groups: buildBenchmarkReport(records),
			unmeasuredComponents: Array.from(
				new Set(records.flatMap((record) => record.cost.unmeasuredComponents)),
			).sort(),
		};
	});
