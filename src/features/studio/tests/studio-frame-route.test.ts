import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_ERROR_CODES, ScrapeError } from "@/lib/design-errors";
import { GET, POST } from "@/routes/api/studio.frame";

const requireUser = vi.fn(async () => ({
	id: "user-123",
	email: "test@example.com",
}));
afterEach(() => vi.restoreAllMocks());

const getStudioFrameVisual = vi.fn(
	async (
		_projectId: string,
		_frameId: string,
		_userId: string,
		options: { forceRecapture?: boolean } = {},
	) => ({
		url: "/api/studio/asset?id=a-1",
		width: 390,
		height: 1765,
		hash: "hash-1",
		forceRecapture: options.forceRecapture === true,
	}),
);

vi.mock("@/lib/session", () => ({
	requireUser: () => requireUser(),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));

vi.mock("@/features/studio/services/studio-frame-visual", () => ({
	getStudioFrameVisual: (
		projectId: string,
		frameId: string,
		userId: string,
		options?: { forceRecapture?: boolean },
	) => getStudioFrameVisual(projectId, frameId, userId, options),
}));

vi.mock("@/features/studio/services/studio-frame-service", () => ({
	addStudioFrame: async (
		projectId: string,
		_userId: string,
		input: unknown,
	) => ({
		id: "f-new",
		projectId,
		name: (input as { name: string }).name,
		status: "ready",
		order: 2,
		htmlCode: "<html>new</html>",
	}),
	reviseStudioFrame: async (
		projectId: string,
		_userId: string,
		frameId: string,
		_prompt: string,
	) => ({
		id: frameId,
		projectId,
		name: "Dashboard",
		status: "ready",
		order: 0,
		htmlCode: "<html>revised</html>",
	}),
}));

vi.mock("@/features/studio/services/studio-retry-service", () => ({
	retryStudioFrame: async (
		projectId: string,
		_userId: string,
		frameId: string,
	) => ({
		id: frameId,
		projectId,
		name: "Transactions",
		status: "ready",
		order: 1,
		htmlCode: "<html>retried</html>",
	}),
	retryStudioPlanning: async (projectId: string, _userId: string) => ({
		id: "job-101",
		projectId,
		status: "queued",
	}),
}));

describe("POST /api/studio/frame", () => {
	it("adds new frame to project", async () => {
		const req = new Request("https://app.test/api/studio/frame", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "add",
				projectId: "proj-1",
				name: "Budget Planning",
				prompt: "Buatkan halaman perencanaan budget bulanan",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.frame.name).toBe("Budget Planning");
	});

	it("revises specific frame", async () => {
		const req = new Request("https://app.test/api/studio/frame", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "revise",
				projectId: "proj-1",
				frameId: "f-1",
				prompt: "Ubah tema jadi gelap",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.frame.htmlCode).toBe("<html>revised</html>");
	});

	it("retries failed frame", async () => {
		const req = new Request("https://app.test/api/studio/frame", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "retry",
				projectId: "proj-1",
				frameId: "f-2",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.frame.status).toBe("ready");
	});

	it("retries failed planning job", async () => {
		const req = new Request("https://app.test/api/studio/frame", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "retry-planning",
				projectId: "proj-1",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.job.status).toBe("queued");
	});
});

describe("GET /api/studio/frame", () => {
	it("logs only classified capture failures and returns safe recovery copy", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		getStudioFrameVisual.mockRejectedValueOnce(
			new ScrapeError("VISUAL_CAPTURE_FAILED", "private upstream payload", {
				cause: new Error("private nested detail"),
				finalUrl: "https://private.test/resource",
			}),
		);
		const res = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?projectId=proj-1&frameId=f-1",
			),
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			code: "VISUAL_CAPTURE_FAILED",
			error: DESIGN_ERROR_CODES.VISUAL_CAPTURE_FAILED,
		});
		expect(log.mock.calls).toEqual([
			["[studio.frame]", { code: "VISUAL_CAPTURE_FAILED" }],
		]);
	});

	it("records successful preview HTTP duration without resource identifiers", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		const clock = vi
			.spyOn(performance, "now")
			.mockReturnValueOnce(10)
			.mockReturnValueOnce(35);
		const res = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?projectId=proj-1&frameId=f-1",
			),
		});
		expect(res.status).toBe(200);
		expect(log.mock.calls).toEqual([
			["[studio.preview.http]", { status: 200, elapsedMs: 25 }],
		]);
		clock.mockRestore();
	});

	it("records failed preview HTTP duration", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(performance, "now")
			.mockReturnValueOnce(10)
			.mockReturnValueOnce(40);
		getStudioFrameVisual.mockRejectedValueOnce(new Error("private response"));
		const res = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?projectId=proj-1&frameId=f-1",
			),
		});
		expect(res.status).toBe(500);
		expect(log.mock.calls).toEqual([
			["[studio.preview.http]", { status: 500, elapsedMs: 30 }],
		]);
	});
	it("serves the cached capture without forcing a re-render", async () => {
		getStudioFrameVisual.mockClear();
		const res = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?projectId=proj-1&frameId=f-1",
			),
		});
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toMatchObject({ width: 390, height: 1765 });
		expect(getStudioFrameVisual).toHaveBeenCalledWith(
			"proj-1",
			"f-1",
			"user-123",
			{ forceRecapture: false },
		);
	});

	it("forces a re-render when the client asks for a retry", async () => {
		getStudioFrameVisual.mockClear();
		const res = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?projectId=proj-1&frameId=f-1&attempt=2",
			),
		});
		expect(res.status).toBe(200);
		expect(getStudioFrameVisual).toHaveBeenCalledWith(
			"proj-1",
			"f-1",
			"user-123",
			{ forceRecapture: true },
		);
	});

	it("rejects a request without frame identity", async () => {
		const res = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?projectId=proj-1",
			),
		});
		expect(res.status).toBe(400);
	});
});

describe("safe frame POST errors", () => {
	it.each([
		{
			failure: new ScrapeError(
				"AI_GENERATION_FAILED",
				"private provider payload",
			),
			code: "AI_GENERATION_FAILED",
			status: 500,
		},
		{
			failure: new Error("private provider payload"),
			code: "STUDIO_FRAME_FAILED",
			status: 500,
		},
		{
			failure: new Error("Unauthorized private session detail"),
			code: "UNAUTHORIZED",
			status: 401,
		},
	])("does not expose POST failure details for $code", async ({
		failure,
		code,
		status,
	}) => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		if (status === 401) requireUser.mockRejectedValueOnce(failure);
		else {
			const service = await import("../services/studio-frame-service");
			vi.spyOn(service, "reviseStudioFrame").mockRejectedValueOnce(failure);
		}
		const res = await POST({
			request: new Request("https://app.test/api/studio/frame", {
				method: "POST",
				body: JSON.stringify({
					action: "revise",
					projectId: "proj-1",
					frameId: "f-1",
					prompt: "Sample revision",
				}),
			}),
		});
		expect(res.status).toBe(status);
		const body = await res.json();
		expect(body.code).toBe(code);
		expect(body.error).toEqual(expect.any(String));
		expect(JSON.stringify(body)).not.toContain("private");
		expect(log.mock.calls).toEqual([["[studio.frame]", { code }]]);
	});
});
