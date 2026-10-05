import { describe, expect, it } from "vitest";
import {
	buildHandshakeMetadata,
	CLI_HANDSHAKE_METADATA_KEY,
	canContinueToSync,
	canOpenSummary,
	hasCliHandshake,
	readCliHandshakeAt,
	syncStatusResponseSchema,
} from "./codebase-sync";

describe("CLI handshake evidence", () => {
	it("reads a persisted handshake timestamp from session metadata", () => {
		const at = "2026-09-19T10:00:00.000Z";
		expect(readCliHandshakeAt({ [CLI_HANDSHAKE_METADATA_KEY]: at })).toBe(at);
	});

	it("fails closed on unusable metadata shapes", () => {
		// The metadata column is jsonb, so it is untrusted input. A corrupt or
		// absent value must read as "no evidence", never unlock a step.
		for (const value of [
			null,
			undefined,
			"2026-09-19T10:00:00.000Z",
			42,
			{},
			[],
			{ [CLI_HANDSHAKE_METADATA_KEY]: "not-a-timestamp" },
			{ [CLI_HANDSHAKE_METADATA_KEY]: null },
		]) {
			expect(readCliHandshakeAt(value)).toBeNull();
		}
	});

	it("persists the handshake timestamp alongside the CLI version and repository name", () => {
		const metadata = buildHandshakeMetadata({
			previous: null,
			cliVersion: "2.1.0",
			repositoryName: "wishlist-app",
			handshakeAt: new Date("2026-09-19T10:00:00.000Z"),
		});
		expect(metadata.cliVersion).toBe("2.1.0");
		expect(metadata.repositoryName).toBe("wishlist-app");
		expect(metadata[CLI_HANDSHAKE_METADATA_KEY]).toBe(
			"2026-09-19T10:00:00.000Z",
		);
	});

	it("keeps the first handshake timestamp when the CLI retries idempotently", () => {
		// A retry must not push the evidence forward, or a stale session would
		// look freshly connected.
		const first = buildHandshakeMetadata({
			previous: null,
			cliVersion: "2.1.0",
			handshakeAt: new Date("2026-09-19T10:00:00.000Z"),
		});
		const retry = buildHandshakeMetadata({
			previous: first,
			cliVersion: "2.1.0",
			handshakeAt: new Date("2026-09-19T11:00:00.000Z"),
		});
		expect(retry[CLI_HANDSHAKE_METADATA_KEY]).toBe("2026-09-19T10:00:00.000Z");
	});

	it("preserves unrelated metadata written by earlier writers", () => {
		const metadata = buildHandshakeMetadata({
			previous: { cliVersion: "2.0.9", custom: "kept" },
			cliVersion: "2.1.0",
			handshakeAt: new Date("2026-09-19T10:00:00.000Z"),
		});
		expect(metadata.custom).toBe("kept");
		expect(metadata.cliVersion).toBe("2.1.0");
	});
});

describe("hasCliHandshake", () => {
	it("is false while the server still waits for the first CLI command", () => {
		expect(hasCliHandshake({ status: "waiting_for_cli" })).toBe(false);
	});

	it("is true for every state the session can only reach after a handshake", () => {
		// `waiting_for_cli -> connected` is reachable only through the CLI
		// handshake route, so advancing past it IS the server-side proof.
		for (const status of [
			"connected",
			"scanning",
			"filtering",
			"uploading",
			"uploaded",
			"analyzing",
			"ready",
		] as const) {
			expect(hasCliHandshake({ status })).toBe(true);
		}
	});

	it("is false for a terminal session that never reached the CLI", () => {
		// `waiting_for_cli -> failed` and `-> expired` are both allowed by the
		// transition map without any CLI contact, so a terminal status alone
		// must never imply a handshake.
		expect(hasCliHandshake({ status: "failed" })).toBe(false);
		expect(hasCliHandshake({ status: "expired" })).toBe(false);
	});

	it("is true for a terminal session that did handshake first", () => {
		expect(
			hasCliHandshake({
				status: "failed",
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
			}),
		).toBe(true);
		expect(
			hasCliHandshake({
				status: "expired",
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
			}),
		).toBe(true);
	});

	it("honours a persisted handshake timestamp over the pre-handshake status", () => {
		expect(
			hasCliHandshake({
				status: "waiting_for_cli",
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
			}),
		).toBe(true);
	});
});

describe("canContinueToSync", () => {
	it("stays false without any server state at all", () => {
		expect(canContinueToSync(null)).toBe(false);
		expect(canContinueToSync(undefined)).toBe(false);
	});

	it("follows the persisted session progression", () => {
		expect(canContinueToSync({ status: "waiting_for_cli" })).toBe(false);
		expect(canContinueToSync({ status: "connected" })).toBe(true);
	});

	it("survives a fast CLI that the browser never observed as connected", () => {
		// The first poll already sees `uploading` or `uploaded`. The CLI
		// definitely ran, so the prompt screen must be able to advance.
		expect(canContinueToSync({ status: "uploading" })).toBe(true);
		expect(canContinueToSync({ status: "uploaded" })).toBe(true);
	});

	it("reconstructs as true after a refresh from persisted handshake evidence", () => {
		expect(
			canContinueToSync({
				status: "uploaded",
				cliConnectedAt: "2026-09-19T10:00:00.000Z",
			}),
		).toBe(true);
	});
});

describe("canOpenSummary", () => {
	it("requires a snapshot bound to the current session", () => {
		expect(canOpenSummary({ status: "uploaded", snapshotId: null })).toBe(
			false,
		);
		expect(canOpenSummary({ status: "uploaded" })).toBe(false);
	});

	it("opens once the transport finished, without waiting for analysis", () => {
		// Analysis pending is a valid reason to ENTER the conclusion screen —
		// that screen owns the pending state itself.
		expect(canOpenSummary({ status: "uploaded", snapshotId: "snap_1" })).toBe(
			true,
		);
		expect(canOpenSummary({ status: "analyzing", snapshotId: "snap_1" })).toBe(
			true,
		);
		expect(canOpenSummary({ status: "ready", snapshotId: "snap_1" })).toBe(
			true,
		);
	});

	it("stays closed while the transport is still running or dead", () => {
		for (const status of [
			"waiting_for_cli",
			"connected",
			"uploading",
			"failed",
			"expired",
		] as const) {
			expect(canOpenSummary({ status, snapshotId: "snap_1" })).toBe(false);
		}
	});
});

describe("status response carries the handshake evidence", () => {
	it("exposes cliConnectedAt as an optional ISO timestamp", () => {
		const parsed = syncStatusResponseSchema.parse({
			projectId: "cb_1",
			sessionId: "sess_1",
			status: "uploaded",
			snapshotId: "snap_1",
			cliConnectedAt: "2026-09-19T10:00:00.000Z",
		});
		expect(parsed.cliConnectedAt).toBe("2026-09-19T10:00:00.000Z");
	});

	it("rejects a malformed handshake timestamp instead of trusting it", () => {
		const parsed = syncStatusResponseSchema.safeParse({
			projectId: "cb_1",
			sessionId: "sess_1",
			status: "uploaded",
			cliConnectedAt: "yesterday",
		});
		expect(parsed.success).toBe(false);
	});

	it("stays absent when the server has no handshake to report", () => {
		const parsed = syncStatusResponseSchema.parse({
			projectId: "cb_1",
			sessionId: "sess_1",
			status: "waiting_for_cli",
			snapshotId: null,
		});
		expect(parsed.cliConnectedAt).toBeUndefined();
	});
});
