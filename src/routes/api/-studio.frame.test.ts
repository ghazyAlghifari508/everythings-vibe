import { describe, expect, it, vi } from "vitest";
import { POST } from "./studio.frame";

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "user-123", email: "test@example.com" }),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));

vi.mock("@/lib/services/studio-service", () => ({
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
