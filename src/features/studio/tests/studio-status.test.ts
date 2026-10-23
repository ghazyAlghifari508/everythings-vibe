// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import { useStudioStatus } from "@/features/studio/hooks/use-studio-status";
import { studioStatusSchema } from "@/features/studio/types/studio-status";

function statusFixture() {
	const date = new Date("2026-01-01T00:00:00Z");
	const project: StudioProjectRow = {
		id: "project-1",
		userId: "user-1",
		title: "Sample",
		designMode: "web",
		designMd: null,
		designSkillId: "none",
		initialPageCount: 3,
		designReference: null,
		designBlueprint: null,
		designBlueprintVersion: 1,
		designSkillVersion: null,
		logoAssetId: null,
		prdContent: null,
		prdFilename: null,
		prdContentHash: null,
		createdAt: date,
		updatedAt: date,
	};
	const frames: StudioFrameRow[] = ["ready", "generating", "queued"].map(
		(status, order) => ({
			id: `frame-${order}`,
			projectId: project.id,
			name: `Screen ${order}`,
			description: null,
			viewport: "web",
			htmlCode: status === "ready" ? "<main>Sample</main>" : null,
			status,
			order,
			error: null,
			attempts: 0,
			visualHash: null,
			promptHash: null,
			createdAt: date,
			updatedAt: date,
		}),
	);
	const activeJob: StudioJobRow = {
		id: "job-1",
		projectId: project.id,
		userId: project.userId,
		prompt: "Sample",
		jobType: "initial",
		targetFrameId: null,
		status: "generating",
		error: null,
		claimedBy: "worker-1",
		attempts: 1,
		claimedAt: date,
		leaseExpiresAt: date,
		startedAt: date,
		finishedAt: null,
		createdAt: date,
		updatedAt: date,
	};
	return { project, frames, activeJob };
}

describe("Studio status contract", () => {
	it("decodes full project endpoint rows and normalizes JSON dates", () => {
		const payload: unknown = JSON.parse(
			JSON.stringify({ ...statusFixture(), revisions: [], logoUrl: null }),
		);
		const result = studioStatusSchema.parse(payload);
		expect(result.project.createdAt).toBeInstanceOf(Date);
		expect(result.frames[0].updatedAt).toBeInstanceOf(Date);
		expect(result.activeJob?.leaseExpiresAt).toBeInstanceOf(Date);
		expect(result.activeJob?.finishedAt).toBeNull();
		expect(result.frames.map((frame) => frame.status)).toEqual([
			"ready",
			"generating",
			"queued",
		]);
	});

	it("rejects missing rows, invalid dates and unknown generation states", () => {
		const data = statusFixture();
		for (const payload of [
			{ frames: [] },
			{ ...data, project: { ...data.project, updatedAt: null } },
			{ ...data, project: { ...data.project, updatedAt: "invalid" } },
			{ ...data, frames: [{ ...data.frames[0], status: "unknown" }] },
			{ ...data, activeJob: { ...data.activeJob, status: "unknown" } },
			{
				...data,
				frames: [{ ...data.frames[0], projectId: "another-project" }],
			},
			{
				...data,
				activeJob: { ...data.activeJob, projectId: "another-project" },
			},
		])
			expect(studioStatusSchema.safeParse(payload).success).toBe(false);
	});
});

describe("Studio authoritative synchronization", () => {
	const fetchMock = vi.fn<typeof fetch>();
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockReset();
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	const reply = (data: unknown) => Response.json(data);
	const tick = async (ms = 1500) =>
		act(async () => {
			await vi.advanceTimersByTimeAsync(ms);
		});

	it("shows independent frame completions without replacing unchanged frame objects", async () => {
		const initial = statusFixture();
		const next = statusFixture();
		next.frames[1] = {
			...next.frames[1],
			status: "ready",
			htmlCode: "<main>Updated</main>",
		};
		fetchMock.mockResolvedValueOnce(reply(next));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick();
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/studio/project?id=project-1",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(result.current.frames.map((frame) => frame.status)).toEqual([
			"ready",
			"ready",
			"queued",
		]);
		expect(result.current.frames[0]).toBe(initial.frames[0]);
		expect(result.current.frames[1].htmlCode).toBe(next.frames[1].htmlCode);
		expect(result.current.isProcessing).toBe(true);
	});

	it.each([
		"completed",
		"partial",
		"failed",
	])("keeps unchanged arrays stable and stops polling on %s", async (jobStatus) => {
		const initial = statusFixture();
		fetchMock.mockResolvedValueOnce(reply(initial));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick();
		expect(result.current.frames).toBe(initial.frames);
		const terminal = statusFixture();
		terminal.frames = terminal.frames.map((frame) => ({
			...frame,
			status: "ready",
		}));
		terminal.activeJob.status = jobStatus;
		fetchMock.mockResolvedValueOnce(reply(terminal));
		await tick();
		expect(result.current.isProcessing).toBe(false);
		await tick(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("serializes slow polls and aborts them before an action refresh, ignoring late results", async () => {
		const initial = statusFixture();
		let release: (response: Response) => void = () => {
			throw new Error("No request");
		};
		fetchMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick();
		await tick(6000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const signal = fetchMock.mock.calls[0][1]?.signal;
		const next = statusFixture();
		next.frames[1].status = "ready";
		fetchMock.mockResolvedValueOnce(reply(next));
		await act(async () => {
			await result.current.syncProjectStatus();
		});
		expect(signal?.aborted).toBe(true);
		await act(async () => {
			release(reply(initial));
		});
		expect(result.current.frames[1].status).toBe("ready");
	});

	it("aborts on unmount and rejects late responses after loader replacement", async () => {
		const initial = statusFixture();
		let release: (response: Response) => void = () => {
			throw new Error("No request");
		};
		fetchMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const { result, rerender, unmount } = renderHook(
			({ data }) => useStudioStatus(data),
			{ initialProps: { data: initial } },
		);
		await tick();
		const signal = fetchMock.mock.calls[0][1]?.signal;
		const replaced = statusFixture();
		replaced.project.title = "Replacement";
		rerender({ data: replaced });
		expect(signal?.aborted).toBe(true);
		await act(async () => {
			release(reply(initial));
		});
		expect(result.current.project.title).toBe("Replacement");
		fetchMock.mockImplementationOnce(() => new Promise(() => {}));
		await tick();
		const lastSignal = fetchMock.mock.calls[1][1]?.signal;
		unmount();
		expect(lastSignal?.aborted).toBe(true);
	});

	it("surfaces network failure without changing generation state, backs off and recovers", async () => {
		const initial = statusFixture();
		fetchMock
			.mockRejectedValueOnce(new TypeError("offline"))
			.mockResolvedValueOnce(reply(initial));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick();
		expect(result.current.error).not.toBe("");
		expect(result.current.frames).toBe(initial.frames);
		expect(result.current.activeJob?.status).toBe("generating");
		await tick(1499);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await tick(1501);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.current.error).toBe("");
	});

	it("bounds retries and resumes on network reconnection or tab visibility", async () => {
		const initial = statusFixture();
		fetchMock.mockRejectedValue(new TypeError("offline"));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick(120_000);
		expect(fetchMock).toHaveBeenCalledTimes(5);
		expect(result.current.error).not.toBe("");
		fetchMock.mockResolvedValue(reply(initial));
		await act(async () => {
			window.dispatchEvent(new Event("online"));
		});
		expect(fetchMock).toHaveBeenCalledTimes(6);
		expect(result.current.error).toBe("");
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(fetchMock).toHaveBeenCalledTimes(7);
	});

	it.each([
		401, 403, 404,
	])("stops permanent HTTP %s failures and preserves completed work", async (status) => {
		fetchMock.mockResolvedValue(new Response(null, { status }));
		const initial = statusFixture();
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick(120_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.current.error).not.toBe("");
		expect(result.current.frames[0]).toBe(initial.frames[0]);
	});

	it("rejects malformed and mismatched project responses without corrupting state", async () => {
		const initial = statusFixture();
		fetchMock.mockResolvedValueOnce(reply({ frames: [] }));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick();
		expect(result.current.error).not.toBe("");
		expect(result.current.frames).toBe(initial.frames);
		const wrong = statusFixture();
		wrong.project.id = "other";
		wrong.frames = [];
		fetchMock.mockResolvedValueOnce(reply({ ...wrong, activeJob: null }));
		await act(async () => {
			await result.current.syncProjectStatus();
		});
		expect(result.current.project.id).toBe(initial.project.id);
	});

	it("retains a newer job even if an older job finishes later", async () => {
		const initial = statusFixture();
		initial.activeJob.createdAt = new Date("2026-01-02T00:00:00Z");
		initial.activeJob.updatedAt = initial.activeJob.createdAt;
		const stale = statusFixture();
		stale.activeJob.id = "old-job";
		stale.activeJob.updatedAt = new Date("2026-01-03T00:00:00Z");
		stale.activeJob.status = "completed";
		fetchMock.mockResolvedValue(reply(stale));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick();
		expect(result.current.activeJob).toBe(initial.activeJob);
	});

	it("times out a stalled request and retries without losing ready frames", async () => {
		const initial = statusFixture();
		fetchMock.mockImplementationOnce(() => new Promise(() => {}));
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick(16_500);
		expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
		expect(result.current.error).not.toBe("");
		expect(result.current.frames[0]).toBe(initial.frames[0]);
		fetchMock.mockResolvedValueOnce(reply(initial));
		await tick(3000);
		expect(result.current.error).toBe("");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("refreshes an idle loader after an action and resumes active-job polling", async () => {
		const initial = { ...statusFixture(), frames: [], activeJob: null };
		const { result } = renderHook(() => useStudioStatus(initial));
		await tick(30_000);
		expect(fetchMock).not.toHaveBeenCalled();
		fetchMock.mockRejectedValueOnce(new TypeError("offline"));
		await act(async () => {
			await result.current.syncProjectStatus();
		});
		expect(result.current.error).not.toBe("");
		fetchMock.mockResolvedValue(reply(statusFixture()));
		await tick(3000);
		expect(result.current.isProcessing).toBe(true);
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
