// Failure classification for the codebase HTTP boundary.
//
// Why this module exists (P02): the Postgres pool can hand a query a client
// whose socket to the database was already dropped. Drizzle wraps the socket
// failure (`read ECONNRESET` / `Connection terminated unexpectedly`, created by
// libuv with a single `TCP.onStreamRead` frame) in a `DrizzleQueryError`, and a
// handler that only catches auth errors lets it escape the route. TanStack Start
// then answers with an opaque `{ unhandled: true }` 500 (and the Vite dev
// middleware logs `[vite] Internal server error: read ECONNRESET`), which tells
// the user nothing and is not retryable in the UI.
//
// An interrupted connection to the database/an upstream is a TRANSIENT
// dependency outage, not a code fault: the honest answer is 503 with a
// retryable flag, and the auth store being unreachable is NOT the same thing as
// "no session" (answering 401 there silently logs a valid user out).
//
// Nothing here inspects query text or parameters: classification only reads
// error codes/messages, so credentials never reach a diagnostic log.
//
// Pure module: no database or server imports, unit-testable in isolation.

/** Status for a dependency that is temporarily unreachable. */
const SERVICE_UNAVAILABLE_STATUS = 503;

/** Seconds the client should wait before retrying a transient outage. */
const RETRY_AFTER_SECONDS = 2;

/** Client closed the connection before an answer existed (Nginx convention). */
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

/**
 * Node/libuv socket failures plus the pg SQLSTATE classes that mean "the
 * connection itself broke", never "this statement was wrong".
 */
const TRANSIENT_ERROR_CODES: Readonly<Record<string, true>> = {
	ECONNRESET: true,
	ECONNABORTED: true,
	EPIPE: true,
	ETIMEDOUT: true,
	ECONNREFUSED: true,
	EHOSTUNREACH: true,
	ENETUNREACH: true,
	ENOTFOUND: true,
	EAI_AGAIN: true,
	ERR_STREAM_PREMATURE_CLOSE: true,
	UND_ERR_SOCKET: true,
	UND_ERR_CLOSED: true,
	UND_ERR_CONNECT_TIMEOUT: true,
	// Postgres: connection exception class 08 and shutdown class 57P0x.
	"08000": true,
	"08001": true,
	"08003": true,
	"08004": true,
	"08006": true,
	"57P01": true,
	"57P02": true,
	"57P03": true,
};

const TRANSIENT_MESSAGE_FRAGMENTS = [
	"econnreset",
	"econnaborted",
	"epipe",
	"etimedout",
	"socket hang up",
	"premature close",
	"connection terminated unexpectedly",
	"connection terminated due to connection timeout",
	"connection error and is not queryable",
	"timeout exceeded when trying to connect",
	"server closed the connection unexpectedly",
	"client has encountered a connection error",
];

/** Upper bound for walking a wrapped error chain (`DrizzleQueryError.cause`). */
const MAX_CAUSE_DEPTH = 6;

function readStringField(value: unknown, key: string): string | null {
	if (typeof value !== "object" || value === null) return null;
	const field = (value as Record<string, unknown>)[key];
	return typeof field === "string" ? field : null;
}

function isTransientErrorValue(value: unknown): boolean {
	const code = readStringField(value, "code");
	if (code && TRANSIENT_ERROR_CODES[code.toUpperCase()]) return true;
	const message = readStringField(value, "message");
	if (!message) return false;
	const lower = message.toLowerCase();
	return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) =>
		lower.includes(fragment),
	);
}

/**
 * True when the failure is a broken/absent connection underneath the request
 * (database socket reset, upstream stream closed, pool connect timeout).
 * Walks the `cause` chain because Drizzle/AI-SDK/pg each wrap one level.
 */
export function isTransientDependencyFailure(error: unknown): boolean {
	const seen = new Set<unknown>();
	let current: unknown = error;
	for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
		if (typeof current !== "object" || current === null) return false;
		if (seen.has(current)) return false;
		seen.add(current);
		if (isTransientErrorValue(current)) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

/** 503 answer for a transient outage: classified, retryable, no internals. */
export function dependencyUnavailableResponse(): Response {
	return Response.json(
		{
			error: "Layanan data sedang tidak tersedia. Coba lagi.",
			code: "SERVICE_UNAVAILABLE",
			retryable: true,
		},
		{
			status: SERVICE_UNAVAILABLE_STATUS,
			headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
		},
	);
}

/** Same 503, or `null` when the failure is not a connection outage. */
export function transientDependencyResponse(error: unknown): Response | null {
	return isTransientDependencyFailure(error)
		? dependencyUnavailableResponse()
		: null;
}

/**
 * Auth guard failures.
 *
 * `requireUser` itself only throws `Unauthorized` (no session) or `Forbidden`
 * (banned). Everything else comes from `auth.api.getSession`, which — measured
 * against a dead session store — throws a bodiless
 * `APIError { message: "Failed to get session", status: "INTERNAL_SERVER_ERROR" }`
 * with no `cause` chain. That is an outage, not "you are signed out": answering
 * 401 would silently log a valid user out.
 */
const AUTH_DENIED_MESSAGES: Readonly<Record<string, true>> = {
	Unauthorized: true,
	Forbidden: true,
};

export function authFailureResponse(error: unknown): Response {
	const unavailable = transientDependencyResponse(error);
	if (unavailable) return unavailable;
	const message = readStringField(error, "message");
	if (message && AUTH_DENIED_MESSAGES[message])
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	return dependencyUnavailableResponse();
}

/** One diagnostic line per outage: scope + code only, never query or params. */
export function logTransientFailure(scope: string, error: unknown): void {
	const code = readStringField(error, "code");
	console.warn(
		`[${scope}] dependency unavailable${code ? ` (${code})` : ""}; answered 503`,
	);
}

/**
 * Sanitized failure log. Drizzle puts the statement AND its parameter values
 * into `message` (`Failed query: … params: <token>`), so neither the error
 * object nor its first line may be logged verbatim: only the message up to
 * `params:` plus the top stack frames (which carry no values).
 */
export function logRouteFailure(scope: string, error: unknown): void {
	const name = readStringField(error, "name") ?? "Error";
	const message = (readStringField(error, "message") ?? "").split("params:")[0];
	const stack = readStringField(error, "stack") ?? "";
	const frames = stack
		.split("\n")
		.filter((line) => /^\s+at\s/.test(line))
		.slice(0, 4)
		.join("\n");
	console.error(
		`[${scope}] failed (${name}): ${message.trim().slice(0, 240)}${frames ? `\n${frames}` : ""}`,
	);
}

/**
 * Request boundary for the codebase HTTP routes. Nothing may escape a route
 * handler: an uncaught throw becomes TanStack Start's opaque
 * `{ unhandled: true }` 500 (and a raw `[vite] Internal server error` line in
 * development). Transient connection outages answer 503 + retryable; anything
 * else answers a classified 500 with a sanitized log line.
 */
export async function guardCodebaseHandler(
	scope: string,
	run: () => Promise<Response>,
): Promise<Response> {
	try {
		return await run();
	} catch (error) {
		const unavailable = transientDependencyResponse(error);
		if (unavailable) {
			logTransientFailure(scope, error);
			return unavailable;
		}
		logRouteFailure(scope, error);
		return Response.json(
			{
				error: "Gagal memproses permintaan. Coba lagi.",
				code: "CODEBASE_REQUEST_FAILED",
			},
			{ status: 500 },
		);
	}
}

/** 499 response for a request whose client already disconnected. */
export function clientClosedResponse(): Response {
	return new Response(null, { status: CLIENT_CLOSED_REQUEST_STATUS });
}
