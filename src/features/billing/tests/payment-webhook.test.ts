import { createHash } from "node:crypto";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	amount: 49_000 as number | undefined,
	filters: [] as unknown[],
	updates: [] as unknown[],
	apply: vi.fn(),
	misconfigured: false,
}));

vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () =>
						state.amount === undefined ? [] : [{ amount: state.amount }],
				}),
			}),
		}),
		update: () => ({
			set: (values: unknown) => {
				state.updates.push(values);
				return {
					where: async (filter: unknown) => state.filters.push(filter),
				};
			},
		}),
	},
}));
vi.mock("../services/midtrans", () => ({
	getMidtransConfig: () => {
		if (state.misconfigured) throw new Error("Missing configuration");
		return { serverKey: "test-secret" };
	},
}));
vi.mock("../services/payment-service", () => ({
	applyOrderSuccess: state.apply,
}));

import { handlePaymentWebhook } from "../services/payment-webhook.server";

function notify(overrides: Record<string, unknown> = {}) {
	const body = {
		order_id: "order-a",
		transaction_status: "settlement",
		status_code: "200",
		gross_amount: "49000.00",
		...overrides,
	};
	return handlePaymentWebhook({
		request: new Request("https://example.test/api/payments/webhook", {
			method: "POST",
			body: JSON.stringify({
				...body,
				signature_key: createHash("sha512")
					.update(
						`${body.order_id}${body.status_code}${body.gross_amount}test-secret`,
					)
					.digest("hex"),
				...overrides,
			}),
		}),
	});
}

beforeEach(() => {
	state.amount = 49_000;
	state.filters = [];
	state.updates = [];
	state.apply.mockReset();
	state.misconfigured = false;
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("payment webhook boundary", () => {
	it("rejects invalid signatures without granting or updating payment state", async () => {
		expect((await notify({ signature_key: "invalid" })).status).toBe(401);
		expect(state.apply).not.toHaveBeenCalled();
		expect(state.updates).toEqual([]);
	});

	it("fails closed when provider credentials are unavailable", async () => {
		state.misconfigured = true;
		expect((await notify()).status).toBe(500);
		expect(state.apply).not.toHaveBeenCalled();
	});

	it.each([
		"challenge",
		"deny",
	])("does not grant a capture under fraud status %s", async (fraud_status) => {
		expect(
			(await notify({ transaction_status: "capture", fraud_status })).status,
		).toBe(200);
		expect(state.apply).not.toHaveBeenCalled();
	});

	it("rejects unknown orders and amount mismatches", async () => {
		state.amount = undefined;
		expect((await notify()).status).toBe(404);
		state.amount = 1;
		expect((await notify()).status).toBe(400);
		expect(state.apply).not.toHaveBeenCalled();
	});

	it.each([
		"settlement",
		"capture",
	])("delegates a verified %s to the shared idempotent grant service", async (transaction_status) => {
		expect(
			(await notify({ transaction_status, fraud_status: "accept" })).status,
		).toBe(200);
		expect(state.apply).toHaveBeenCalledExactlyOnceWith("order-a");
	});

	it("returns a retryable failure when the grant transaction rejects", async () => {
		state.apply.mockRejectedValueOnce(new Error("Transaction failed"));
		expect((await notify()).status).toBe(500);
		expect(state.updates).toEqual([]);
	});

	it.each([
		"refund",
		"chargeback",
		"partial_refund",
		"partial_chargeback",
	])("retains settled status and records %s for history", async (transaction_status) => {
		expect((await notify({ transaction_status })).status).toBe(200);
		expect(state.updates).toHaveLength(1);
		expect(state.updates[0]).toHaveProperty("midtransResponse");
		const filter = state.filters[0];
		if (!(filter instanceof SQL))
			throw new Error("Missing settled payment guard");
		expect(new PgDialect().sqlToQuery(filter).params).toEqual(["order-a"]);
	});

	it.each([
		"expire",
		"cancel",
		"deny",
	])("preserves settled success when receiving %s", async (transaction_status) => {
		expect((await notify({ transaction_status })).status).toBe(200);
		expect(state.apply).not.toHaveBeenCalled();
		expect(state.updates[0]).toEqual({ status: "failed" });
		const filter = state.filters[0];
		if (!(filter instanceof SQL)) throw new Error("Missing payment guard");
		const query = new PgDialect().sqlToQuery(filter);
		expect(query.params).toEqual(["order-a", "success"]);
		expect(query.sql).toContain("<>");
	});
});
