import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { requireUserServer } from "@/lib/session";

export const loadSettings = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { users } = await import("@/db/schema");
		const [profile] = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				image: users.image,
			})
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);
		return { profile };
	},
);

export const loadProfile = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { users } = await import("@/db/schema");
		const [profile] = await db
			.select({
				fullName: users.fullName,
				image: users.image,
				role: users.role,
			})
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);
		return { profile, email: user.email };
	},
);

export const loadNotifications = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { notificationPreferences } = await import("@/db/schema");
		const [prefs] = await db
			.select()
			.from(notificationPreferences)
			.where(eq(notificationPreferences.userId, user.id))
			.limit(1);
		return { preferences: prefs ?? null };
	},
);

export const loadApiKeys = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { apiKeys } = await import("@/db/schema");
		const rows = await db
			.select({
				id: apiKeys.id,
				name: apiKeys.name,
				keyPrefix: apiKeys.keyPrefix,
				scopes: apiKeys.scopes,
				lastUsedAt: apiKeys.lastUsedAt,
				createdAt: apiKeys.createdAt,
				expiresAt: apiKeys.expiresAt,
			})
			.from(apiKeys)
			.where(eq(apiKeys.userId, user.id))
			.orderBy(asc(apiKeys.createdAt));
		const keys = rows.map((k) => ({
			id: k.id,
			name: k.name,
			key_prefix: k.keyPrefix ?? "",
			scopes: k.scopes ?? [],
			last_used_at: k.lastUsedAt?.toISOString() ?? null,
			created_at: k.createdAt?.toISOString() ?? "",
			expires_at: k.expiresAt?.toISOString() ?? null,
		}));
		return { keys };
	},
);
