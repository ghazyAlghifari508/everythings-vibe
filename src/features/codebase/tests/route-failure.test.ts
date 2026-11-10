import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	authFailureResponse,
	CLIENT_CLOSED_REQUEST_STATUS,
	clientClosedResponse,
	dependencyUnavailableResponse,
	guardCodebaseHandler,
	isTransientDependencyFailure,
	logRouteFailure,
	transientDependencyResponse,
} from "../services/route-failure";

// P02 regression suite for the connection-failure classification.
//
// The reproduced bug: a pooled Postgres connection is reset while a codebase
// request is in flight. Drizzle rejects with `DrizzleQueryError` whose `cause`
// is the libuv error (`read ECONNRESET`, stack = one `TCP.onStreamRead` frame).
// The handler let it escape, so the browser received TanStack Start's opaque
// `{ unhandled: true }` 500 and the Vite dev middleware printed
// `[vite] Internal server error: read ECONNRESET`. These tests pin the
// classification + boundary contract that replaces that behavior.

function socketResetError(message = "read ECONNRESET"): Error {
	const error = new Error(message);
	// libuv builds this error outside JS: the only frame is the emit site.
	error.stack = `${message}\n    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)`;
	return error;
}

function drizzleWrapper(cause: unknown): Error {
	const error = new Error("Failed query: select 1 params: secret-token");
	error.name = "DrizzleQueryError";
	(error as Error & { cause?: unknown }).cause = cause;
	return error;
}

describe("isTransientDependencyFailure", () => {
	it("classifies a pooled Postgres socket reset wrapped by drizzle", () => {
		assert.equal(
			isTransientDependencyFailure(drizzleWrapper(socketResetError())),
			true,
		);
	});

	it("classifies a socket error carrying a Node code", () => {
		const error = Object.assign(new Error("socket hang up"), {
			code: "ECONNRESET",
		});
		assert.equal(isTransientDependencyFailure(error), true);
	});

	it("classifies pg connection termination messages", () => {
		assert.equal(
			isTransientDependencyFailure(
				new Error("Connection terminated unexpectedly"),
			),
			true,
		);
		assert.equal(
			isTransientDependencyFailure(
				new Error("Connection terminated due to connection timeout"),
			),
			true,
		);
	});

	it("classifies Postgres shutdown SQLSTATEs", () => {
		for (const code of ["57P01", "57P03", "08006"]) {
			assert.equal(
				isTransientDependencyFailure(
					Object.assign(new Error("boom"), { code }),
				),
				true,
			);
		}
	});

	it("does not classify application or validation failures", () => {
		assert.equal(
			isTransientDependencyFailure(new Error("Invalid request body")),
			false,
		);
		assert.equal(
			isTransientDependencyFailure(
				Object.assign(new Error("duplicate key value"), { code: "23505" }),
			),
			false,
		);
		assert.equal(isTransientDependencyFailure(null), false);
		assert.equal(isTransientDependencyFailure("read ECONNRESET"), false);
	});

	it("walks a deep cause chain and terminates on a cycle", () => {
		const root = socketResetError();
		let wrapped: Error = root;
		for (let depth = 0; depth < 4; depth += 1)
			wrapped = drizzleWrapper(wrapped);
		assert.equal(isTransientDependencyFailure(wrapped), true);

		const cyclic = new Error("outer") as Error & { cause?: unknown };
		cyclic.cause = cyclic;
		assert.equal(isTransientDependencyFailure(cyclic), false);
	});
});

describe("authFailureResponse", () => {
	it("answers 503, not 401, when the session store is unreachable", async () => {
		const res = authFailureResponse(drizzleWrapper(socketResetError()));
		expect(res.status).toBe(503);
		const body = (await res.json()) as { code: string; retryable: boolean };
		expect(body.code).toBe("SERVICE_UNAVAILABLE");
		expect(body.retryable).toBe(true);
	});

	it("keeps 401 for a missing session", async () => {
		const res = authFailureResponse(new Error("Unauthorized"));
		expect(res.status).toBe(401);
	});

	it("answers 503 for the bodiless APIError better-auth throws on a dead store", async () => {
		// Measured shape: { name: "APIError", message: "Failed to get session",
		// status: "INTERNAL_SERVER_ERROR" } with no cause chain.
		const error = Object.assign(new Error("Failed to get session"), {
			name: "APIError",
			status: "INTERNAL_SERVER_ERROR",
		});
		const res = authFailureResponse(error);
		expect(res.status).toBe(503);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("SERVICE_UNAVAILABLE");
	});

	it("keeps 401 for a banned session", async () => {
		const res = authFailureResponse(new Error("Forbidden"));
		expect(res.status).toBe(401);
	});
});

describe("dependencyUnavailableResponse", () => {
	it("is retryable, classified, and never echoes internals", async () => {
		const res = dependencyUnavailableResponse();
		expect(res.status).toBe(503);
		expect(res.headers.get("Retry-After")).toBe("2");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toEqual({
			error: "Layanan data sedang tidak tersedia. Coba lagi.",
			code: "SERVICE_UNAVAILABLE",
			retryable: true,
		});
	});

	it("is offered only for transient failures", () => {
		expect(
			transientDependencyResponse(drizzleWrapper(socketResetError())),
		).not.toBeNull();
		expect(transientDependencyResponse(new Error("syntax error"))).toBeNull();
	});
});

describe("clientClosedResponse", () => {
	it("answers the client-closed status with no body", () => {
		const res = clientClosedResponse();
		expect(res.status).toBe(CLIENT_CLOSED_REQUEST_STATUS);
		expect(res.status).toBe(499);
		expect(res.body).toBeNull();
	});
});

describe("logRouteFailure", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		errorSpy.mockRestore();
	});

	it("never logs drizzle parameter values", () => {
		logRouteFailure("unit/test", drizzleWrapper(socketResetError("boom")));
		const logged = errorSpy.mock.calls
			.flat()
			.map((value: unknown) => String(value))
			.join("\n");
		expect(logged).toContain("DrizzleQueryError");
		expect(logged).not.toContain("secret-token");
		expect(logged).not.toContain("params:");
	});
});

describe("guardCodebaseHandler", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		errorSpy.mockRestore();
		warnSpy.mockRestore();
	});

	it("passes a successful response through untouched", async () => {
		const ok = Response.json({ ok: true });
		const res = await guardCodebaseHandler("unit/test", async () => ok);
		expect(res).toBe(ok);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("turns an escaping connection reset into a classified 503", async () => {
		const res = await guardCodebaseHandler("unit/test", async () => {
			throw drizzleWrapper(socketResetError());
		});
		expect(res.status).toBe(503);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("SERVICE_UNAVAILABLE");
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("answers a classified 500 for a real fault instead of throwing", async () => {
		const res = await guardCodebaseHandler("unit/test", async () => {
			throw new Error("unexpected");
		});
		expect(res.status).toBe(500);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("CODEBASE_REQUEST_FAILED");
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});

	it("catches a synchronous throw from the handler", async () => {
		const res = await guardCodebaseHandler("unit/test", () => {
			throw drizzleWrapper(socketResetError());
		});
		expect(res.status).toBe(503);
	});
});
