import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const productTrials = pgTable(
	"product_trials",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		product: text("product", { enum: ["studio", "scrape"] }).notNull(),
		jobId: text("job_id").notNull(),
		requestKey: text("request_key").notNull(),
		requestHash: text("request_hash").notNull(),
		state: text("state", { enum: ["reserved", "consumed", "released"] })
			.notNull()
			.default("reserved"),
		completedUnits: integer("completed_units").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("product_trials_live_account_product_idx")
			.on(t.userId, t.product)
			.where(sql`${t.state} <> 'released'`),
		uniqueIndex("product_trials_request_idx").on(
			t.userId,
			t.product,
			t.requestKey,
		),
		uniqueIndex("product_trials_job_idx").on(t.userId, t.product, t.jobId),
		check(
			"product_trials_product_check",
			sql`${t.product} in ('studio', 'scrape')`,
		),
		check(
			"product_trials_state_check",
			sql`(${t.state} = 'reserved' and ${t.completedUnits} = 0 and ${t.closedAt} is null) or (${t.state} = 'consumed' and ${t.completedUnits} > 0 and ${t.closedAt} is not null) or (${t.state} = 'released' and ${t.completedUnits} = 0 and ${t.closedAt} is not null)`,
		),
	],
);
