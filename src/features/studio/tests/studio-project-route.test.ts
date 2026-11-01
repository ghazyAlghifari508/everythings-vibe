import { describe, expect, it, vi } from "vitest";
import { ScrapeError } from "@/lib/design-errors";
import { GET, POST } from "@/routes/api/studio.project";

const detailFailure = vi.hoisted(() => ({ error: null as Error | null }));

const duplicate = vi.hoisted(() =>
	vi.fn(async () => ({ id: "independent-project" })),
);
const remove = vi.hoisted(() =>
	vi.fn(async (projectId: string) => ({ id: projectId })),
);
const updatePreferences = vi.hoisted(() =>
	vi.fn(async (projectId: string) => ({ id: projectId })),
);

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "user-123", email: "test@example.com" }),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));

vi.mock("@/features/studio/services/studio-project-lifecycle", () => ({
	duplicateStudioProject: duplicate,
	deleteStudioProject: remove,
}));

vi.mock("@/features/studio/services/studio-preferences-service", () => ({
	updateStudioPreferences: updatePreferences,
}));

vi.mock("@/features/studio/services/studio-project-detail", () => ({
	getStudioProjectDetail: async (id: string, _userId: string) => {
		if (detailFailure.error) throw detailFailure.error;
		return {
			project: { id, title: "Test Canvas", designMode: "mobile" },
			frames: [
				{
					id: "f-1",
					name: "Dashboard",
					status: "ready",
					order: 0,
					htmlCode: "<html></html>",
				},
				{
					id: "f-2",
					name: "Transactions",
					status: "generating",
					order: 1,
					htmlCode: null,
				},
			],
			activeJob: { id: "job-1", status: "generating" },
			logoUrl: null,
			revisions: [],
			latest: null,
		};
	},
}));

describe("GET /api/studio/project", () => {
	it("duplicates through the authenticated owner and returns the independent identifier", async () => {
		const response = await POST({
			request: new Request("https://app.test/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "duplicate",
					projectId: "source-project",
				}),
			}),
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ projectId: "independent-project" });
		expect(duplicate).toHaveBeenCalledWith("source-project", "user-123");
	});

	it("deletes through the authenticated owner and reports the removed identifier", async () => {
		const response = await POST({
			request: new Request("https://app.test/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "delete",
					projectId: "owned-project",
				}),
			}),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			deletedProjectId: "owned-project",
		});
		expect(remove).toHaveBeenCalledWith("owned-project", "user-123");
	});

	it("rejects a delete payload without a project id", async () => {
		remove.mockClear();
		const response = await POST({
			request: new Request("https://app.test/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "delete" }),
			}),
		});
		expect(response.status).toBe(400);
		expect(remove).not.toHaveBeenCalled();
	});

	it("rejects the removed design-system action as an unsupported operation", async () => {
		updatePreferences.mockClear();
		const response = await POST({
			request: new Request("https://app.test/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "design-system",
					projectId: "proj-1",
					designReference: { kind: "theme", id: "workspace" },
				}),
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Aksi project tidak valid.",
		});
		expect(updatePreferences).not.toHaveBeenCalled();
	});

	it("persists skill preference updates for the authenticated owner", async () => {
		updatePreferences.mockClear();
		const response = await POST({
			request: new Request("https://app.test/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "preferences",
					projectId: "proj-1",
					designSkillId: "taste",
				}),
			}),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ project: { id: "proj-1" } });
		expect(updatePreferences).toHaveBeenCalledWith(
			"proj-1",
			"user-123",
			expect.objectContaining({
				action: "preferences",
				projectId: "proj-1",
				designSkillId: "taste",
			}),
		);
	});

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

	it("rejects blank or oversized project identifiers", async () => {
		for (const id of ["   ", "x".repeat(201)]) {
			const response = await GET({
				request: new Request(
					`https://app.test/api/studio/project?id=${encodeURIComponent(id)}`,
				),
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				code: "INVALID_PROJECT_ID",
			});
		}
	});

	it("does not cache live partial frame state", async () => {
		const response = await GET({
			request: new Request("https://app.test/api/studio/project?id=proj-1"),
		});
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		const body = await response.json();
		expect(
			body.frames.map((frame: { status: string }) => frame.status),
		).toEqual(["ready", "generating"]);
	});

	it("classifies missing and unavailable project reads without exposing internals", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			for (const [failure, status, code] of [
				[
					new ScrapeError("WEBSITE_BLOCKED", "private resource"),
					404,
					"STUDIO_NOT_FOUND",
				],
				[new Error("Unauthorized"), 401, "UNAUTHORIZED"],
				[
					new Error("private database details"),
					500,
					"STUDIO_STATUS_UNAVAILABLE",
				],
			] as const) {
				detailFailure.error = failure;
				const response = await GET({
					request: new Request("https://app.test/api/studio/project?id=proj-1"),
				});
				expect(response.status).toBe(status);
				expect(await response.json()).toMatchObject({ code });
			}
			expect(JSON.stringify(log.mock.calls)).not.toContain(
				"private database details",
			);
		} finally {
			detailFailure.error = null;
			log.mockRestore();
		}
	});
});
