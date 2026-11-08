import { expect, test } from "vitest";
import { isResyncSessionVerified } from "../services/sync";

test("resync completion requires the new attempt's readable analysis, not only its upload", () => {
	const status = {
		sessionId: "new",
		status: "uploaded" as const,
		snapshotId: "new-snapshot",
	};
	expect(isResyncSessionVerified({ status, activeSessionId: "new" })).toBe(
		false,
	);
	expect(
		isResyncSessionVerified({
			status: { ...status, analysisStatus: "pending" },
			activeSessionId: "new",
		}),
	).toBe(false);
	expect(
		isResyncSessionVerified({
			status: {
				...status,
				analysisStatus: "ready",
				analysisId: "new-analysis",
			},
			activeSessionId: "new",
		}),
	).toBe(true);
	expect(
		isResyncSessionVerified({
			status: {
				...status,
				analysisStatus: "ready",
				analysisId: "new-analysis",
			},
			activeSessionId: "old",
		}),
	).toBe(false);
});
