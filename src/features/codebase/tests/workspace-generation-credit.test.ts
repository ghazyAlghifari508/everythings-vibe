import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbSelect: vi.fn(),
	dbUpdate: vi.fn(),
	readArtifact: vi.fn(),
	releaseCredit: vi.fn(),
	quarantineCredit: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: { select: mocks.dbSelect, update: mocks.dbUpdate },
}));

vi.mock("../services/workspace-generation-artifact.server", () => ({
	readWorkspaceGenerationArtifact: mocks.readArtifact,
}));

vi.mock("@/lib/services/credit-service", () => ({
	isReleasableReservation: (state: string) =>
		["quoted", "reserved", "running"].includes(state),
	releaseCreditOperation: mocks.releaseCredit,
	quarantineCreditOperation: mocks.quarantineCredit,
}));

import {
	prepareStageCreditGuard,
	recoverStaleGenerationState,
} from "../services/workspace-generation-credit.server";
import { createMockDbChain } from "./workspace-generation-test-helpers";

const { selectChain, updateChain } = createMockDbChain(
	mocks.dbSelect,
	mocks.dbUpdate,
);

beforeEach(() => {
	vi.clearAllMocks();
	selectChain([]);
	updateChain();
});

describe("credit audit and safety guards", () => {
	it("blocks execution if existing credit operation is quarantined", async () => {
		selectChain([{ id: "credit-q", state: "quarantined" }]);

		const claim = {
			operationId: "op-guard",
			userId: "u-1",
			projectId: "p-1",
			stage: "prd" as const,
			token: "tok-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		await expect(prepareStageCreditGuard(claim)).rejects.toMatchObject({
			code: "CREDIT_QUARANTINED",
		});
	});

	it("blocks fresh charges if artifact is already settled for stable operation identity", async () => {
		selectChain([{ id: "credit-settled", state: "settled" }]);
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "prd-v1",
			result: {},
		});

		const claim = {
			operationId: "op-settled-repeat",
			userId: "u-1",
			projectId: "p-1",
			stage: "prd" as const,
			token: "tok-1",
			attempt: 2,
			input: {},
			signal: new AbortController().signal,
		};

		await expect(prepareStageCreditGuard(claim)).rejects.toMatchObject({
			code: "CREDIT_ALREADY_SETTLED",
		});
	});

	it("releases stale running credit reservation scoped strictly to exact billingKey", async () => {
		selectChain([{ id: "credit-stale", state: "running" }]);
		mocks.readArtifact.mockResolvedValueOnce(null);

		const claim = {
			operationId: "op-clean",
			userId: "u-1",
			projectId: "p-1",
			stage: "ac" as const,
			token: "tok-1",
			attempt: 2,
			input: {},
			signal: new AbortController().signal,
		};

		await prepareStageCreditGuard(claim);
		expect(mocks.releaseCredit).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "u-1",
				operationId: "credit-stale",
			}),
		);
	});

	it("never swallows quarantine failure on credit cleanup error", async () => {
		selectChain([{ id: "credit-fail", state: "running" }]);
		mocks.readArtifact.mockResolvedValueOnce(null);
		mocks.releaseCredit.mockRejectedValueOnce(new Error("Release failed"));
		mocks.quarantineCredit.mockRejectedValueOnce(
			new Error("Quarantine DB connection failed"),
		);

		const claim = {
			operationId: "op-quarantine-fail",
			userId: "u-1",
			projectId: "p-1",
			stage: "prd" as const,
			token: "tok-1",
			attempt: 1,
			input: {},
			signal: new AbortController().signal,
		};

		await expect(prepareStageCreditGuard(claim)).rejects.toThrow(
			"Quarantine DB connection failed",
		);
	});
});

describe("recoverStaleGenerationState", () => {
	it("recovers completed state when valid artifact was persisted before crash", async () => {
		mocks.readArtifact.mockResolvedValueOnce({
			artifactId: "art-recovered",
			result: {},
		});

		const res = await recoverStaleGenerationState("u-1", "p-1", "feature");
		expect(res.recovered).toBe(true);
		expect(res.artifactId).toBe("art-recovered");
		expect(mocks.dbUpdate).toHaveBeenCalled();
	});

	it("resets project status and releases stuck credit reservations when no artifact exists", async () => {
		mocks.readArtifact.mockResolvedValueOnce(null);
		const chain = {
			from: () => chain,
			where: () => chain,
			orderBy: async () => [{ id: "op-stuck", state: "reserved" }],
		};
		mocks.dbSelect.mockReturnValue(chain);

		const res = await recoverStaleGenerationState("u-1", "p-1", "task");
		expect(res.recovered).toBe(true);
		expect(res.reset).toBe(true);
		expect(mocks.releaseCredit).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "u-1",
				operationId: "op-stuck",
			}),
		);
	});

	it("never swallows quarantine failure during stale recovery", async () => {
		mocks.readArtifact.mockResolvedValueOnce(null);
		selectChain([{ id: "op-stale-q", state: "reserved" }]);
		mocks.releaseCredit.mockRejectedValueOnce(new Error("Release failed"));
		mocks.quarantineCredit.mockRejectedValueOnce(
			new Error("Quarantine network timeout"),
		);

		await expect(
			recoverStaleGenerationState("u-1", "p-1", "task", "op-stale-q"),
		).rejects.toThrow("Quarantine network timeout");
	});
});
