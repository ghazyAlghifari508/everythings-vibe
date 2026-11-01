import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Users - Better Auth core "user" table (mapped via usePlural). Extra
// columns (fullName/company/role) are app-owned; Better Auth ignores them.
export const users = pgTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name").notNull().default(""),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	fullName: text("full_name"),
	company: text("company"),
	role: text("role"),
	isAdmin: boolean("is_admin").notNull().default(false),
	bannedAt: timestamp("banned_at"),
	// Account entitlement survives repository deletion and subscription renewal.
	initialAnalysisUsedAt: timestamp("initial_analysis_used_at", {
		withTimezone: true,
	}),
	billingExempt: boolean("billing_exempt").notNull().default(false),
	billingExemptionReason: text("billing_exemption_reason"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// === BETTER AUTH TABLES ===

export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
	"accounts",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Api Keys
export const apiKeys = pgTable(
	"api_keys",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(),
		key: text("key").notNull().unique(),
		keyPrefix: text("key_prefix"),
		scopes: text("scopes").array(),
		lastUsedAt: timestamp("last_used_at"),
		createdAt: timestamp("created_at").defaultNow(),
		expiresAt: timestamp("expires_at"),
	},
	(t) => [index("api_keys_user_id_idx").on(t.userId)],
);

// Notification Preferences
export const notificationPreferences = pgTable("notification_preferences", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id)
		.unique(),
	quotaWarning: boolean("quota_warning").notNull().default(true),
	prdCompleted: boolean("prd_completed").notNull().default(true),
	paymentUpdates: boolean("payment_updates").notNull().default(true),
	productUpdates: boolean("product_updates").notNull().default(false),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});
