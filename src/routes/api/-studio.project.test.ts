import { describe, expect, it, vi } from "vitest";
import { GET } from "./studio.project";

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "user-123", email: "test@example.com" }),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));

vi.mock("@/lib/services/studio-service", () => ({
	getStudioProjectDetail: async (id: string, userId: string) => ({
		project: { id, title: "Test Canvas", designMode: "mobile" },
		frames: [
			{ id: "f-1", name: "Dashboard", status: "ready", order: 0, htmlCode: "<html></html>" },
			{ id: "f-2", name: "Transactions", status: "generating", order: 1, htmlCode: null },
		],
		activeJob: { id: "job-1", status: "generating" },
		logoUrl: null,
		revisions: [],
		latest: null,
	}),
}));

describe("GET /api/studio/project", () => {
	it("returns project detail with frames and active job", async () => {
		const req = new Request("https://app.test/api/studio/project?id=proj-1");
		const res = await GET({ request: req });
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.project.id).toBe("proj-1");
		expect(data.frames).toHaveLength(2);
		expect(data.frames[0].name).toBe("Dashboard");
		expect(data.activeJob.status).toBe("generating");
	});

	it("returns 400 when id param is missing", async () => {
		const req = new Request("https://app.test/api/studio/project");
		const res = await GET({ request: req });
		expect(res.status).toBe(400);
	});
});
