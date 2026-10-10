import { describe, expect, it, vi } from "vitest";
import { POST, studioGenerateBodySchema } from "./studio.generate";

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "user-123", email: "test@example.com" }),
}));

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));

vi.mock("@/lib/services/studio-service", () => ({
	createStudioProject: async () => ({
		project: { id: "proj-100", title: "Test Project" },
		revision: { version: 1, htmlCode: "<html>mock</html>" },
	}),
	reviseStudioProject: async () => ({
		version: 2,
		htmlCode: "<html>revised mock</html>",
	}),
	getStudioProject: vi.fn(),
	listStudioProjects: vi.fn(),
}));

describe("POST /api/studio/generate", () => {
	it("validates generation payload schema", () => {
		expect(
			studioGenerateBodySchema.safeParse({ prompt: "Buat landing page" })
				.success,
		).toBe(true);

		expect(
			studioGenerateBodySchema.safeParse({
				prompt: "Buat mobile app",
				designMode: "mobile",
				designMd: "## Tokens",
				logo: {
					filename: "logo.png",
					mimeType: "image/png",
					data: "base64data",
				},
			}).success,
		).toBe(true);

		// Invalid designMode
		expect(
			studioGenerateBodySchema.safeParse({
				prompt: "Buat mobile app",
				designMode: "desktop-wrong",
			}).success,
		).toBe(false);
	});

	it("handles new project creation with 201 status", async () => {
		const req = new Request("https://app.test/api/studio/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: "Buat landing page portofolio developer",
				designMode: "web",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data).toEqual({
			projectId: "proj-100",
			version: 1,
			htmlCode: "<html>mock</html>",
		});
	});

	it("handles project revision when projectId is provided", async () => {
		const req = new Request("https://app.test/api/studio/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				projectId: "proj-100",
				prompt: "Ubah warna header menjadi gelap",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data).toEqual({
			projectId: "proj-100",
			version: 2,
			htmlCode: "<html>revised mock</html>",
		});
	});

	it("rejects prompt shorter than minimum required length", async () => {
		const req = new Request("https://app.test/api/studio/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt: "pendek",
			}),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain("minimal");
	});
});
