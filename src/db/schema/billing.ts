import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
	CreditComplexityMetrics,
	CreditLedgerEntryType,
	CreditOperationKind,
	CreditOperationState,
	CreditPricingVersion,
} from "@/lib/adaptive-credit";
import { users } from "./auth";
import { projects } from "./projects";

export const subscriptions = pgTable(
	"subscriptions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		plan: text("plan").notNull().default("free"), // free, pro, hengker
		status: text("status").notNull().default("active"),
		midtransOrderId: text("midtrans_order_id"),
		// Monthly model (spec §4): credits reset every period; leftover credits
		// are forfeited at period end. NULL period on a PAID row = legacy
		// one-time purchase (grandfathered, never expires). NULL on a FREE row
		// is initialized lazily by the write-on-read rollover in credits.ts.
		// timestamptz: a period boundary is an instant; storing it without a
		// zone made the rendered date depend on the reader's timezone.
		currentPeriodStart: timestamp("current_period_start", {
			withTimezone: true,
		}),
		currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		// Email notification progress: 0 none, 1 = pre-expiry notice,
		// 2..4 = paused reminders D+1/D+7/D+14 (see billing-emails.ts).
		reminderCount: integer("reminder_count").notNull().default(0),
		credits: integer("credits").notNull().default(0),
		creditsUsed: integer("credits_used").notNull().default(0),
		creditsReserved: integer("credits_reserved").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [
		// Hot path: credits.ts getCreditBalance/consumeCredit query
		// WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
		index("subscriptions_user_id_created_at_idx").on(t.userId, t.createdAt),
		// Composite unique/FK targets keep `id` first: drizzle-kit introspects
		// multi-column unique constraints in physical column order, and any other
		// order makes `db:push` plan a DROP that Postgres refuses (FK dependency).
		unique("subscriptions_user_id_id_unique").on(t.id, t.userId),
		check(
			"subscriptions_credits_reserved_non_negative_check",
			sql`credits_reserved >= 0`,
		),
	],
);

export interface CreditOperationFailure {
	code?: string;
	message?: string;
	occurredAt?: string;
}

export interface CreditOperationReconciliation {
	status: "not_required" | "pending" | "resolved";
	code?: string;
	accounting?: "none" | "manual_correction_required";
	resolvedAt?: string;
}

export interface CreditOperationUsage {
	measuredUnits: number;
}

export interface CreditLedgerMetadata {
	reason?: string;
	measuredUnits?: number;
	reconciliationCode?: string;
	accounting?: "manual_correction_required";
}

export type CreditOperationStage = "codebase" | "prd" | "ac" | "task";
export type CreditLedgerSourceCategory =
	| "adaptive_credit"
	| "system_grant"
	| "manual_correction";

export const creditOperations = pgTable(
	"credit_operations",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		subscriptionId: text("subscription_id").references(() => subscriptions.id, {
			onDelete: "restrict",
		}),
		initialAnalysisAllowance: boolean("initial_analysis_allowance")
			.notNull()
			.default(false),
		isExempt: boolean("is_exempt").notNull().default(false),
		exemptionReason: text("exemption_reason"),
		kind: text("kind").$type<CreditOperationKind>().notNull(),
		stage: text("stage").$type<CreditOperationStage>().notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		state: text("state")
			.$type<CreditOperationState>()
			.notNull()
			.default("quoted"),
		estimatedCredits: integer("estimated_credits").notNull(),
		reservedCredits: integer("reserved_credits").notNull().default(0),
		maximumCredits: integer("maximum_credits").notNull(),
		finalCharge: integer("final_charge"),
		pricingVersion: text("pricing_version")
			.$type<CreditPricingVersion>()
			.notNull(),
		metrics: jsonb("metrics").$type<CreditComplexityMetrics>().notNull(),
		usage: jsonb("usage").$type<CreditOperationUsage>(),
		capApplied: boolean("cap_applied").notNull().default(false),
		artifactReference: text("artifact_reference"),
		analysisReference: text("analysis_reference"),
		failure: jsonb("failure").$type<CreditOperationFailure>(),
		reconciliation:
			jsonb("reconciliation").$type<CreditOperationReconciliation>(),
		expiresAt: timestamp("expires_at"),
		reservedAt: timestamp("reserved_at"),
		startedAt: timestamp("started_at"),
		settledAt: timestamp("settled_at"),
		releasedAt: timestamp("released_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("credit_operations_user_id_idempotency_key_unique").on(
			t.userId,
			t.idempotencyKey,
		),
		index("credit_operations_user_id_created_at_idx").on(t.userId, t.createdAt),
		index("credit_operations_user_project_id_stage_idx").on(
			t.userId,
			t.projectId,
			t.stage,
		),
		index("credit_operations_state_expires_at_idx").on(t.state, t.expiresAt),
		uniqueIndex("credit_operations_active_initial_allowance_unique")
			.on(t.userId)
			.where(
				sql`initial_analysis_allowance = true AND state IN ('reserved', 'running', 'settling')`,
			),
		check(
			"credit_operations_credit_bounds_check",
			sql`estimated_credits >= 0 AND reserved_credits >= 0 AND maximum_credits >= 0 AND estimated_credits <= maximum_credits AND reserved_credits <= maximum_credits AND (final_charge IS NULL OR (final_charge >= 0 AND final_charge <= maximum_credits))`,
		),
		unique("credit_operations_user_id_id_unique").on(t.id, t.userId),
		foreignKey({
			columns: [t.userId, t.projectId],
			foreignColumns: [projects.userId, projects.id],
			name: "credit_operations_user_project_fk",
		}),
		foreignKey({
			columns: [t.userId, t.subscriptionId],
			foreignColumns: [subscriptions.userId, subscriptions.id],
			name: "credit_operations_user_subscription_fk",
		}),
	],
);

export const creditLedgerEntries = pgTable(
	"credit_ledger_entries",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		operationId: text("operation_id").references(() => creditOperations.id),
		amount: integer("amount").notNull(),
		entryType: text("entry_type").$type<CreditLedgerEntryType>().notNull(),
		sourceCategory: text("source_category")
			.$type<CreditLedgerSourceCategory>()
			.notNull(),
		pricingVersion: text("pricing_version")
			.$type<CreditPricingVersion>()
			.notNull(),
		metadata: jsonb("metadata").$type<CreditLedgerMetadata>().notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("credit_ledger_entries_user_id_created_at_idx").on(
			t.userId,
			t.createdAt,
		),
		index("credit_ledger_entries_user_id_operation_id_idx").on(
			t.userId,
			t.operationId,
		),
		check("credit_ledger_entries_amount_nonzero_check", sql`amount <> 0`),
		foreignKey({
			columns: [t.userId, t.operationId],
			foreignColumns: [creditOperations.userId, creditOperations.id],
			name: "credit_ledger_entries_user_operation_fk",
		}),
	],
);

// Quotas
export const quotas = pgTable(
	"quotas",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		prdUsed: integer("prd_used").default(0),
		prdLimit: integer("prd_limit").default(-1),
		revisionUsed: integer("revision_used").default(0),
		revisionLimit: integer("revision_limit").default(-1),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [index("quotas_user_id_idx").on(t.userId)],
);

export const payments = pgTable(
	"payments",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		orderId: text("order_id").notNull().unique(),
		plan: text("plan").notNull(),
		amount: integer("amount"),
		status: text("status").default("pending"),
		midtransResponse: jsonb("midtrans_response"),
		// timestamptz: a payment instant must not depend on the server session
		// timezone. With `timestamp` the driver parsed the stored wall clock in
		// the host zone (UTC on Vercel), shifting every displayed date.
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	},
	(t) => [index("payments_user_id_idx").on(t.userId)],
);

export const billingExemptionAuditLogs = pgTable(
	"billing_exemption_audit_logs",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		actorId: text("actor_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		action: text("action").$type<"granted" | "revoked">().notNull(),
		reason: text("reason"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("billing_exemption_audit_logs_user_id_idx").on(t.userId),
		index("billing_exemption_audit_logs_actor_id_idx").on(t.actorId),
	],
);
