import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./scrape";

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: vi.fn(() => new Headers()),
}));

vi.mock("@/lib/session", () => ({
	requireUser: vi.fn(async () => ({
		id: "user-123",
		email: "test@example.com",
	})),
}));

const mockCreateScrape = vi.fn();
const mockRunScrapePipeline = vi.fn();
const mockGetScrapeById = vi.fn();

vi.mock("@/lib/services/scrape-service", () => ({
	createScrape: (...args: unknown[]) => mockCreateScrape(...args),
	runScrapePipeline: (...args: unknown[]) => mockRunScrapePipeline(...args),
	getScrapeById: (...args: unknown[]) => mockGetScrapeById(...args),
	retryScrape: vi.fn(),
	deleteScrape: vi.fn(),
	listScrapes: vi.fn(),
}));

describe("Scrape API Route Modes", () => {
	it("creates a scrape in design mode by default", async () => {
		mockCreateScrape.mockResolvedValueOnce({
			id: "sc-design-1",
			sourceUrl: "https://example.com",
			domain: "example.com",
			mode: "design",
			status: "queued",
		});

		const req = new Request("http://localhost/api/scrape", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://example.com" }),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.scrapeId).toBe("sc-design-1");
		expect(json.mode).toBe("design");
		expect(mockCreateScrape).toHaveBeenCalledWith(
			"user-123",
			"https://example.com",
			"design",
		);
		expect(mockRunScrapePipeline).toHaveBeenCalledWith(
			"sc-design-1",
			"user-123",
		);
	});

	it("creates a scrape in html mode when explicitly requested", async () => {
		mockCreateScrape.mockResolvedValueOnce({
			id: "sc-html-1",
			sourceUrl: "https://example.com",
			domain: "example.com",
			mode: "html",
			status: "queued",
		});

		const req = new Request("http://localhost/api/scrape", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://example.com", mode: "html" }),
		});

		const res = await POST({ request: req });
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.scrapeId).toBe("sc-html-1");
		expect(json.mode).toBe("html");
		expect(mockCreateScrape).toHaveBeenCalledWith(
			"user-123",
			"https://example.com",
			"html",
		);
		expect(mockRunScrapePipeline).toHaveBeenCalledWith("sc-html-1", "user-123");
	});

	it("returns mode in GET /api/scrape?id=...", async () => {
		mockGetScrapeById.mockResolvedValueOnce({
			id: "sc-html-1",
			sourceUrl: "https://example.com",
			domain: "example.com",
			mode: "html",
			status: "completed",
			html: "<html><body>Hello</body></html>",
			previewHtml: "<html><body>Hello</body></html>",
			document: null,
		});

		const req = new Request("http://localhost/api/scrape?id=sc-html-1");
		const res = await GET({ request: req });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.scrape.mode).toBe("html");
		expect(json.scrape.document).toBeNull();
	});
});
