import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { codebaseSyncSessions, codebases } from "./codebase";

// Durable request aliases survive a lost response, including after completion.
// No credential is recoverable through this table.
export const codebaseSyncRequests = pgTable(
	"codebase_sync_requests",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		codebaseId: text("codebase_id")
			.notNull()
			.references(() => codebases.id, { onDelete: "cascade" }),
		sessionId: text("session_id")
			.notNull()
			.references(() => codebaseSyncSessions.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [index("codebase_sync_requests_owner_idx").on(t.userId, t.codebaseId)],
);
