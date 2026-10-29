import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { fetchAsset } from "@/features/scrape/services/http-transport";
import { shouldRetryImageFetch } from "@/features/scrape/services/scrape-image-extraction";
import {
	createImageSitePolicy,
	imageResultCounts,
} from "@/features/scrape/services/scrape-image-policy";
import { validateStoredImage } from "@/features/scrape/services/scrape-image-storage";

const urlGuard = vi.hoisted(() => ({ validateUrl: vi.fn() }));
vi.mock("@/lib/url-validator", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/url-validator")>();
	return {
		...actual,
		validateUrl: (...args: Parameters<typeof actual.validateUrl>) =>
			urlGuard.validateUrl.getMockImplementation()
				? urlGuard.validateUrl(...args)
				: actual.validateUrl(...args),
	};
});

it.each([
	["png", "image/png"],
	["jpg", "image/jpeg"],
	["webp", "image/webp"],
	["gif", "image/gif"],
	["avif", "image/avif"],
])("validates actual %s fixtures and rejects mismatched MIME", (ext, mime) => {
	const body = readFileSync(
		`src/features/scrape/tests/fixtures/images/valid.${ext}`,
	);
	expect(validateStoredImage(body, mime)).toMatchObject({
		mimeType: mime,
		byteLength: body.length,
	});
	expect(() => validateStoredImage(body, "text/html")).toThrowError(
		expect.objectContaining({ assetCode: "INVALID_IMAGE" }),
	);
});

it("accepts valid safe SVG and rejects active or unsafe SVG constructs", () => {
	const validSvg =
		"<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><g clip-path='url(#a)'><path fill='#fff' d='M0 0h24v24H0z'/></g><defs><clipPath id='a'><path d='M0 0h24v24H0z'/></clipPath></defs></svg>";
	expect(
		validateStoredImage(Buffer.from(validSvg), "image/svg+xml"),
	).toMatchObject({
		mimeType: "image/svg+xml",
		byteLength: Buffer.byteLength(validSvg),
	});
	expect(() =>
		validateStoredImage(Buffer.from(validSvg), "image/png"),
	).toThrowError(expect.objectContaining({ assetCode: "INVALID_IMAGE" }));

	for (const unsafeSvg of [
		"<svg onload='alert(1)'><script>alert(1)</script></svg>",
		"<svg><foreignObject/><image href='http://127.0.0.1/private'/></svg>",
		"<!DOCTYPE svg [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><svg>&xxe;</svg>",
		"<svg xmlns='http://www.w3.org/2000/svg'><a href='javascript:alert(1)'><path d='M0 0'/></a></svg>",
		"<svg xmlns='http://www.w3.org/2000/svg'><style>@import url('https://evil.example/x.css');</style></svg>",
	]) {
		expect(() =>
			validateStoredImage(Buffer.from(unsafeSvg), "image/svg+xml"),
		).toThrowError(expect.objectContaining({ assetCode: "UNSAFE_SVG" }));
		expect(() =>
			validateStoredImage(Buffer.from(unsafeSvg), "image/png"),
		).toThrowError(expect.objectContaining({ assetCode: "INVALID_IMAGE" }));
	}
});

it("does not retry redirects, policy or content rejection", () => {
	expect(shouldRetryImageFetch(0, null, "WEBSITE_BLOCKED")).toBe(false);
	for (const code of [
		"PRIVATE_URL_BLOCKED",
		"INVALID_IMAGE",
		"UNSUPPORTED_FORMAT",
		"STORAGE_FAILED",
	])
		expect(shouldRetryImageFetch(0, null, code)).toBe(false);
});

it("rejects truncated PNG and invalid AVIF brand boxes", () => {
	const png = readFileSync(
		"src/features/scrape/tests/fixtures/images/valid.png",
	);
	expect(() => validateStoredImage(png.subarray(0, 33), "image/png")).toThrow();
	const avif = Buffer.alloc(24);
	avif.writeUInt32BE(7, 0);
	avif.write("ftypavif", 4);
	expect(() => validateStoredImage(avif, "image/avif")).toThrow();
});

it("counts pending and duplicates independently of durable results", () => {
	expect(
		imageResultCounts(
			[
				{ url: "a", assetId: "stored" },
				{ url: "b", assetId: null },
			],
			[{ url: "a" }, { url: "c" }, { url: "c" }],
		),
	).toEqual({
		discoveredImages: 3,
		processedImages: 2,
		savedImages: 1,
		failedResources: 1,
		pendingImages: 1,
		duplicateCandidates: 1,
	});
});

it("fetches and validates redirected, CDN-403-robots, HTML-error-page, 403, 404 and 429 responses against a mock HTTP server", async () => {
	const png = readFileSync(
		"src/features/scrape/tests/fixtures/images/valid.png",
	);
	let origin = "";
	const server = createServer((req, res) => {
		const path = req.url ?? "/";
		if (path === "/robots.txt") {
			res.writeHead(403, { "content-type": "text/xml" });
			res.end("<Error><Code>MissingKey</Code></Error>");
			return;
		}
		if (path === "/redirect.png") {
			res.writeHead(302, { Location: `${origin}/valid.png` });
			res.end();
			return;
		}
		if (path === "/valid.png") {
			res.writeHead(200, { "content-type": "image/png" });
			res.end(png);
			return;
		}
		if (path === "/soft-404.png") {
			res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			res.end("<!doctype html><html><body>Not found</body></html>");
			return;
		}
		if (path === "/forbidden.png") {
			res.writeHead(403, { "content-type": "text/plain" });
			res.end("Forbidden");
			return;
		}
		if (path === "/missing.png") {
			res.writeHead(404, { "content-type": "text/plain" });
			res.end("Not Found");
			return;
		}
		if (path === "/rate-limited.png") {
			res.writeHead(429, {
				"content-type": "text/plain",
				"retry-after": "45",
			});
			res.end("Too Many Requests");
			return;
		}
		res.writeHead(404);
		res.end();
	});
	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve()),
	);
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	origin = `http://127.0.0.1:${port}`;
	urlGuard.validateUrl.mockImplementation(async (raw: string) => ({
		url: new URL(raw),
		normalized: raw,
		ip: "127.0.0.1",
	}));
	try {
		const allowUrl = createImageSitePolicy();
		const redirected = await fetchAsset(`${origin}/redirect.png`, 0, {
			allowUrl,
		});
		expect(redirected.status).toBe(200);
		expect(redirected.finalUrl).toBe(`${origin}/valid.png`);
		expect(
			validateStoredImage(redirected.body, redirected.contentType).mimeType,
		).toBe("image/png");

		const soft404 = await fetchAsset(`${origin}/soft-404.png`, 0, {
			allowUrl,
		});
		expect(soft404.status).toBe(200);
		expect(() =>
			validateStoredImage(soft404.body, soft404.contentType),
		).toThrowError(expect.objectContaining({ assetCode: "INVALID_IMAGE" }));

		const forbidden = await fetchAsset(`${origin}/forbidden.png`, 0, {
			allowUrl,
		});
		expect(forbidden.status).toBe(403);

		const missing = await fetchAsset(`${origin}/missing.png`, 0, {
			allowUrl,
		});
		expect(missing.status).toBe(404);

		const rateLimited = await fetchAsset(`${origin}/rate-limited.png`, 0, {
			allowUrl,
		});
		expect(rateLimited.status).toBe(429);
		expect(rateLimited.retryAfter).toBe("45");
	} finally {
		urlGuard.validateUrl.mockReset();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
