import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchAsset,
	fetchHtml,
} from "@/features/scrape/services/http-transport";
import { FETCH_MAX_REDIRECTS } from "@/lib/constants";

const guard = vi.hoisted(() => ({ validateUrl: vi.fn() }));
vi.mock("@/lib/url-validator", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/url-validator")>();
	return { ...actual, validateUrl: guard.validateUrl };
});

const requests: string[] = [];
let server: Server | undefined;
let origin = "";
let hangStarted: (() => void) | undefined;

// The transport under test is exercised against a real loopback server so the
// redirect, byte-cap and abort contracts are proven end to end, not mocked.
beforeEach(async () => {
	requests.length = 0;
	guard.validateUrl.mockReset();
	server = createServer((req, res) => {
		const path = req.url ?? "/";
		requests.push(path);
		if (path.startsWith("/entry")) {
			res.writeHead(302, { Location: `${origin}/secret` });
			res.end();
			return;
		}
		if (path.startsWith("/loop")) {
			res.writeHead(302, { Location: `${origin}/loop` });
			res.end();
			return;
		}
		if (path.startsWith("/hang")) {
			res.writeHead(200, { "content-type": "image/png" });
			hangStarted?.();
			return;
		}
		if (path.startsWith("/page"))
			res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		else if (path.startsWith("/binary"))
			res.writeHead(200, { "content-type": "application/octet-stream" });
		else res.writeHead(200, { "content-type": "image/png" });
		res.end("payload-payload");
	});
	await new Promise<void>((resolve) =>
		server?.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server?.address();
	origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterEach(async () => {
	const current = server;
	server = undefined;
	hangStarted = undefined;
	if (!current) return;
	current.closeAllConnections();
	await new Promise<void>((resolve) => current.close(() => resolve()));
});

function allowLoopback() {
	guard.validateUrl.mockImplementation(async (raw: string) => ({
		url: new URL(raw),
		normalized: raw,
		ip: "127.0.0.1",
	}));
}

describe("redirect handling", () => {
	it("refuses to follow a chain longer than the configured cap", async () => {
		await expect(
			fetchHtml("https://example.com/", FETCH_MAX_REDIRECTS + 1),
		).rejects.toThrowError(
			expect.objectContaining({ code: "WEBSITE_BLOCKED" }),
		);
		await expect(
			fetchAsset("https://example.com/", FETCH_MAX_REDIRECTS + 1),
		).rejects.toThrowError(
			expect.objectContaining({ code: "WEBSITE_BLOCKED" }),
		);
		expect(guard.validateUrl).not.toHaveBeenCalled();
	});

	it("stops a redirect loop at the cap instead of following it forever", async () => {
		allowLoopback();
		await expect(fetchAsset(`${origin}/loop`)).rejects.toThrowError(
			expect.objectContaining({ code: "WEBSITE_BLOCKED" }),
		);
		expect(requests).toHaveLength(FETCH_MAX_REDIRECTS + 1);
	});

	it("re-validates every redirect target instead of trusting the Location header", async () => {
		const real = await vi.importActual<typeof import("@/lib/url-validator")>(
			"@/lib/url-validator",
		);
		guard.validateUrl.mockImplementation(async (raw: string) =>
			raw === `${origin}/entry`
				? { url: new URL(raw), normalized: raw, ip: "127.0.0.1" }
				: real.validateUrl(raw),
		);
		await expect(fetchAsset(`${origin}/entry`)).rejects.toThrowError(
			expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
		);
		expect(requests).toEqual(["/entry"]);
	});
});

describe("caller allowlist", () => {
	it("refuses a target the caller's policy rejects before dialling it", async () => {
		const allowUrl = vi.fn(async () => false);
		await expect(
			fetchAsset("https://outside.example/secret.png", 0, { allowUrl }),
		).rejects.toThrowError(
			expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
		);
		expect(allowUrl).toHaveBeenCalledWith("https://outside.example/secret.png");
		expect(guard.validateUrl).not.toHaveBeenCalled();
	});
});

describe("response limits", () => {
	it("returns guarded HTML for an allowed page", async () => {
		allowLoopback();
		await expect(fetchHtml(`${origin}/page`)).resolves.toEqual({
			html: "payload-payload",
			status: 200,
			finalUrl: `${origin}/page`,
		});
	});

	it("rejects a body that is not HTML", async () => {
		allowLoopback();
		await expect(fetchHtml(`${origin}/binary`)).rejects.toThrowError(
			expect.objectContaining({ code: "NO_ANALYZABLE_CONTENT" }),
		);
	});

	it("rejects an asset larger than the caller's byte budget without hanging", async () => {
		allowLoopback();
		await expect(
			fetchAsset(`${origin}/asset.png`, 0, { maxBytes: 4 }),
		).rejects.toThrowError(
			expect.objectContaining({ code: "NO_ANALYZABLE_CONTENT" }),
		);
	});

	it("aborts an in-flight fetch through the job signal", async () => {
		allowLoopback();
		const started = new Promise<void>((resolve) => {
			hangStarted = resolve;
		});
		const controller = new AbortController();
		const pending = fetchAsset(`${origin}/hang`, 0, {
			signal: controller.signal,
		});
		await started;
		controller.abort();
		await expect(pending).rejects.toThrowError(
			expect.objectContaining({ code: "JOB_TIMEOUT" }),
		);
	});
});
