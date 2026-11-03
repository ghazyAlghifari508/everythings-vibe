import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	creditLedgerEntries,
	creditOperations,
	notificationPreferences,
	payments,
	users,
} from "@/db/schema";

const state = vi.hoisted(() => ({
	user: { id: "tenant-a" } as { id: string } | null,
	deletes: [] as { table: unknown; filter: unknown }[],
	writes: [] as { table: unknown; values: Record<string, unknown> }[],
	filters: [] as unknown[],
	conflicts: [] as { target: unknown; set: Record<string, unknown> }[],
	transactions: 0,
	failDelete: false,
	hasPayments: false,
	signOut: vi.fn(async () => {}),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: <T>(validate: (data: T) => T) => ({
			handler:
				(handler: (input: { data: T }) => Promise<void>) =>
				async (input: { data: T }) =>
					handler({ data: validate(input.data) }),
		}),
	}),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/session", () => ({
	requireUser: async () => {
		if (!state.user) throw new Error("Unauthorized");
		return state.user;
	},
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: state.signOut } } }));
vi.mock("@/db", () => ({
	db: {
		update: (table: unknown) => ({
			set: (values: Record<string, unknown>) => ({
				where: async (filter: unknown) => {
					state.writes.push({ table, values });
					state.filters.push(filter);
				},
			}),
		}),
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown>) => ({
				onConflictDoUpdate: async (conflict: {
					target: unknown;
					set: Record<string, unknown>;
				}) => {
					state.writes.push({ table, values });
					state.conflicts.push(conflict);
				},
			}),
		}),
		transaction: async (run: (tx: unknown) => Promise<void>) => {
			state.transactions++;
			await run({
				delete: (table: unknown) => ({
					where: async (filter: unknown) => {
						if (state.failDelete) throw new Error("storage failure");
						state.deletes.push({ table, filter });
					},
				}),
				select: () => ({
					from: (table: unknown) => ({
						where: () => {
							const rows =
								table === payments
									? state.hasPayments
										? [{ id: "payment" }]
										: []
									: [{ id: "owned-child" }];
							return Object.assign(Promise.resolve(rows), {
								limit: async () => rows,
							});
						},
					}),
				}),
			});
		},
	},
}));

import { updateNotificationPreferences } from "../services/notifications";
import { deleteAccount, updateProfile } from "../services/settings";

function query(filter: unknown) {
	if (!(filter instanceof SQL)) throw new Error("Missing SQL ownership filter");
	return new PgDialect().sqlToQuery(filter);
}

function form(values: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.set(key, value);
	return data;
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
	state.user = { id: "tenant-a" };
	state.deletes = [];
	state.writes = [];
	state.filters = [];
	state.conflicts = [];
	state.transactions = 0;
	state.failDelete = false;
	state.hasPayments = false;
	state.signOut.mockClear();
	vi.stubGlobal("window", { location: { assign: vi.fn() } });
});

describe("profile and notification actions", () => {
	it("normalizes a profile and restricts its update to the authenticated user", async () => {
		await updateProfile(
			form({ full_name: "  Sample Name  ", role: "developer" }),
		);
		expect(state.writes[0]?.table).toBe(users);
		expect(state.writes[0]?.values).toMatchObject({
			fullName: "Sample Name",
			role: "developer",
		});
		expect(query(state.filters[0]).params).toEqual(["tenant-a"]);
	});

	it("rejects an invalid role before writing", async () => {
		await expect(
			updateProfile(form({ full_name: "Sample", role: "admin" })),
		).rejects.toThrow("Invalid profile payload");
		expect(state.writes).toEqual([]);
	});

	it("upserts checkbox preferences under the authenticated user's unique key", async () => {
		await updateNotificationPreferences(
			form({ quota_warning: "on", payment_updates: "on" }),
		);
		expect(state.writes[0]?.table).toBe(notificationPreferences);
		expect(state.writes[0]?.values).toMatchObject({
			userId: "tenant-a",
			quotaWarning: true,
			paymentUpdates: true,
			prdCompleted: false,
			productUpdates: false,
		});
		expect(state.conflicts[0]?.target).toBe(notificationPreferences.userId);
		expect(state.conflicts[0]?.set).toMatchObject({
			quotaWarning: true,
			paymentUpdates: true,
			prdCompleted: false,
			productUpdates: false,
		});
		expect(state.conflicts[0]?.set).not.toHaveProperty("userId");
	});

	it("requires a session before any preference write", async () => {
		state.user = null;
		await expect(updateNotificationPreferences(form({}))).rejects.toThrow(
			"Unauthorized",
		);
		expect(state.writes).toEqual([]);
	});
});

describe("account deletion transaction", () => {
	it("rejects missing confirmation before opening a transaction", async () => {
		await expect(deleteAccount(form({ confirm: "" }))).rejects.toThrow();
		expect(state.transactions).toBe(0);
		expect(state.signOut).not.toHaveBeenCalled();
	});

	it("refuses account deletion when payment history exists", async () => {
		state.hasPayments = true;
		await expect(deleteAccount(form({ confirm: "HAPUS" }))).rejects.toThrow(
			/pembayaran/i,
		);
		expect(state.deletes).toEqual([]);
		expect(state.signOut).not.toHaveBeenCalled();
	});

	it("deletes ledger leaves before operations and user last, then signs out", async () => {
		await deleteAccount(form({ confirm: "HAPUS" }));
		expect(state.transactions).toBe(1);
		const tables = state.deletes.map(({ table }) => table);
		expect(tables.indexOf(creditLedgerEntries)).toBeLessThan(
			tables.indexOf(creditOperations),
		);
		expect(tables.at(-1)).toBe(users);
		expect(query(state.deletes.at(-1)?.filter).params).toEqual(["tenant-a"]);
		expect(state.signOut).toHaveBeenCalledOnce();
		expect(window.location.assign).toHaveBeenCalledWith("/");
	});

	it("propagates a transaction failure without signing out or redirecting", async () => {
		state.failDelete = true;
		await expect(deleteAccount(form({ confirm: "HAPUS" }))).rejects.toThrow(
			"storage failure",
		);
		expect(state.transactions).toBe(1);
		expect(state.signOut).not.toHaveBeenCalled();
		expect(window.location.assign).not.toHaveBeenCalled();
	});
});
