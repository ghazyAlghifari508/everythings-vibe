import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const feedback = pgTable(
	"feedback",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => users.id),
		message: text("message").notNull(),
		type: text("type").default("general"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [index("feedback_user_id_idx").on(t.userId)],
);

// Error Reports
export const errorReports = pgTable(
	"error_reports",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => users.id),
		errorMessage: text("error_message").notNull(),
		context: text("context"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [index("error_reports_user_id_idx").on(t.userId)],
);

// Rate Limits (kustom selain Better Auth)
export const rateLimits = pgTable(
	"rate_limits",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		action: text("action").notNull(),
		windowStart: timestamp("window_start").notNull(),
		count: integer("count").default(1),
	},
	(t) => [
		uniqueIndex("rate_limits_user_id_action_window_start_unique").on(
			t.userId,
			t.action,
			t.windowStart,
		),
	],
);
