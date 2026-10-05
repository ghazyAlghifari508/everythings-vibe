import { describe, expect, it } from "vitest";
import {
	assertSyncTransition,
	buildFailureMetadata,
	buildIdempotencyKey,
	canTransitionSyncStatus,
	isExpectedIdempotencyKey,
	readSyncFailureMetadata,
	resolveSyncFailureMessage,
	sanitizeSyncErrorCode,
	sanitizeSyncErrorMessage,
	syncFailureRequestSchema,
} from "./codebase-sync";

describe("local preparation failure reporting contract", () => {
	it("accepts a failure report carrying only attempt identity and an idempotency key", () => {
		const parsed = syncFailureRequestSchema.safeParse({
			sessionId: "sess_1",
			attemptId: "sess_1",
			idempotencyKey: "sess_1:failure:0",
		});
		expect(parsed.success).toBe(true);
	});

	it("never accepts free-text failure detail from the CLI", () => {
		const parsed = syncFailureRequestSchema.parse({
			sessionId: "sess_1",
			attemptId: "sess_1",
			idempotencyKey: "sess_1:failure:0",
			errorCode: "SCAN_FAILED",
			errorMessage: "Cannot scan repository root: some/local/path",
		});
		expect(parsed).toEqual({
			sessionId: "sess_1",
			attemptId: "sess_1",
			idempotencyKey: "sess_1:failure:0",
			errorCode: "SCAN_FAILED",
		});
	});

	it("rejects a failure report with no attempt identity", () => {
		expect(
			syncFailureRequestSchema.safeParse({ idempotencyKey: "k" }).success,
		).toBe(false);
	});

	it("binds the failure idempotency key to the attempt and its slot", () => {
		expect(buildIdempotencyKey("sess_1", "failure", 0)).toBe(
			"sess_1:failure:0",
		);
		expect(
			isExpectedIdempotencyKey("sess_1:failure:0", "sess_1", "failure", 0),
		).toBe(true);
		expect(
			isExpectedIdempotencyKey("sess_1:failure:1", "sess_1", "failure", 0),
		).toBe(false);
		expect(
			isExpectedIdempotencyKey("sess_2:failure:0", "sess_1", "failure", 0),
		).toBe(false);
	});
});

describe("failure is reachable from every state the CLI can occupy after handshake", () => {
	it("allows failing the preparation window the CLI reported as connected", () => {
		expect(canTransitionSyncStatus("connected", "failed")).toBe(true);
		expect(() => assertSyncTransition("connected", "failed")).not.toThrow();
	});

	it("allows failing an in-flight upload", () => {
		expect(canTransitionSyncStatus("uploading", "failed")).toBe(true);
	});

	it("keeps a terminal session terminal so a retry must mint a new attempt", () => {
		expect(canTransitionSyncStatus("failed", "failed")).toBe(false);
		expect(canTransitionSyncStatus("uploaded", "failed")).toBe(true);
	});
});

describe("server-owned failure copy", () => {
	it("resolves every reportable preparation code to real user-facing copy", () => {
		const codes = ["SCAN_FAILED", "BLOCKED_CONTENT", "SNAPSHOT_TOO_LARGE"];
		for (const code of codes) {
			const message = resolveSyncFailureMessage(code);
			expect(message).toBeTruthy();
			expect(message).not.toBe(code);
		}
	});

	it("collapses an unknown code to the generic failure copy", () => {
		expect(resolveSyncFailureMessage("ECONNREFUSED db password=hunter2")).toBe(
			resolveSyncFailureMessage("SYNC_FAILED"),
		);
	});

	it("keeps whitelisted preparation codes intact through the sanitizer", () => {
		expect(sanitizeSyncErrorCode("SCAN_FAILED")).toBe("SCAN_FAILED");
		expect(sanitizeSyncErrorCode("BLOCKED_CONTENT")).toBe("BLOCKED_CONTENT");
		expect(sanitizeSyncErrorCode("BLOCKED_CONTENT_AT some/local/path")).toBe(
			"SYNC_FAILED",
		);
	});

	it("strips control characters from persisted failure copy", () => {
		expect(sanitizeSyncErrorMessage("line one\nline two")).toBe(
			"line oneline two",
		);
		expect(sanitizeSyncErrorMessage("line one\r\nline two")).toBe(
			"line oneline two",
		);
	});
});

describe("persisted failure evidence on the session row", () => {
	it("round-trips the failure evidence through session metadata", () => {
		const metadata = buildFailureMetadata({
			previous: {
				cliVersion: "3.0.0",
				handshakeAt: "2026-01-01T00:00:00.000Z",
			},
			rawCode: "SCAN_FAILED",
			failedAt: new Date("2026-01-02T03:04:05.000Z"),
		});
		const read = readSyncFailureMetadata(metadata);
		expect(read?.code).toBe("SCAN_FAILED");
		expect(read?.message).toBe(resolveSyncFailureMessage("SCAN_FAILED"));
	});

	it("persists the server's own copy rather than CLI error text", () => {
		const metadata = buildFailureMetadata({
			previous: null,
			rawCode: "SCAN_FAILED",
			failedAt: new Date("2026-01-02T03:04:05.000Z"),
		});
		expect(metadata).toMatchObject({
			failureMessage: resolveSyncFailureMessage("SCAN_FAILED"),
		});
	});

	it("never stores a client-supplied path in the persisted failure evidence", () => {
		const metadata = buildFailureMetadata({
			previous: null,
			rawCode: "SCAN_FAILED",
			failedAt: new Date("2026-01-02T03:04:05.000Z"),
		});
		const serialized = JSON.stringify(metadata);
		expect(serialized).not.toContain("C:\\");
		expect(serialized).not.toContain("/home/");
	});

	it("preserves unrelated handshake metadata a previous writer stored", () => {
		const metadata = buildFailureMetadata({
			previous: {
				cliVersion: "3.0.0",
				handshakeAt: "2026-01-01T00:00:00.000Z",
			},
			rawCode: "BLOCKED_CONTENT",
			failedAt: new Date("2026-01-02T03:04:05.000Z"),
		});
		expect(metadata).toMatchObject({
			cliVersion: "3.0.0",
			handshakeAt: "2026-01-01T00:00:00.000Z",
		});
		expect(readSyncFailureMetadata(metadata)?.code).toBe("BLOCKED_CONTENT");
	});

	it("reports no failure evidence for a session that never failed", () => {
		expect(readSyncFailureMetadata(null)).toBeNull();
		expect(
			readSyncFailureMetadata({ cliVersion: "3.0.0", handshakeAt: "x" }),
		).toBeNull();
	});
});
