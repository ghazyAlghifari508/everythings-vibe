import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
	ShadowCostBreakdown,
	ShadowProviderUsage,
	ShadowResourceMetrics,
} from "@/features/usage-metering/types/shadow-usage";
import { users } from "./auth";

/**
 * Observational cost evidence only. Nothing here is a charge, a credit
 * movement, or a trial entitlement. A unique (user, dedupe_key) pair makes
 * repeated delivery of the same attempt idempotent.
 */
export const shadowUsageRecords = pgTable(
	"shadow_usage_records",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		productFamily: text("product_family", {
			enum: ["studio", "scrape"],
		}).notNull(),
		operationKind: text("operation_kind").notNull(),
		logicalJobId: text("logical_job_id").notNull(),
		attemptId: text("attempt_id").notNull(),
		attemptIndex: integer("attempt_index").notNull().default(0),
		retryCount: integer("retry_count").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		durationMs: integer("duration_ms"),
		outcome: text("outcome", {
			enum: ["success", "partial", "failed", "cancelled", "unknown"],
		})
			.notNull()
			.default("unknown"),
		requestedUnits: integer("requested_units"),
		completedUnits: integer("completed_units").notNull().default(0),
		resourceLimits: jsonb("resource_limits")
			.$type<Record<string, number>>()
			.notNull()
			.default({}),
		metrics: jsonb("metrics").$type<ShadowResourceMetrics>().notNull(),
		providerUsage: jsonb("provider_usage").$type<ShadowProviderUsage | null>(),
		cost: jsonb("cost").$type<ShadowCostBreakdown>().notNull(),
		priceSource: text("price_source"),
		pricingVersion: text("pricing_version"),
		dedupeKey: text("dedupe_key").notNull(),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		uniqueIndex("shadow_usage_records_user_dedupe_unique").on(
			t.userId,
			t.dedupeKey,
		),
		index("shadow_usage_records_group_recorded_idx").on(
			t.productFamily,
			t.operationKind,
			t.recordedAt,
		),
		index("shadow_usage_records_user_recorded_idx").on(t.userId, t.recordedAt),
		index("shadow_usage_records_expires_at_idx").on(t.expiresAt),
		check(
			"shadow_usage_records_bounds_check",
			sql`attempt_index >= 0 AND retry_count >= 0 AND completed_units >= 0 AND (duration_ms IS NULL OR duration_ms >= 0)`,
		),
	],
);

export type ShadowUsageRecordRow = typeof shadowUsageRecords.$inferSelect;
export type InsertShadowUsageRow = typeof shadowUsageRecords.$inferInsert;
