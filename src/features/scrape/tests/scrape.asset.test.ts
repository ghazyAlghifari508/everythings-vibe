import { describe, expect, it, vi } from "vitest";
import {
	issuePreviewAssetCapability,
	storedImageAssetUrl,
} from "@/features/scrape/utils/preview-capabilities";
import { SCRAPE_MAX_ASSET_BYTES } from "@/lib/constants";
import { ScrapeError } from "@/lib/design-errors";
import { GET } from "@/routes/api/scrape.asset";

const secret = "test secret with enough entropy for preview capabilities";
const claims = {
	scrapeId: "scrape-1",
	ownerId: "owner-1",
	target: "https://assets.example/image.png",
	expiresAt: Date.now() + 60_000,
};

function request(url: string, headers = new Headers()): Request {
	return new Request(url, { headers });
}

describe("scrape asset capability route", () => {
	it("rejects corrupt, mismatched, empty and oversized stored bytes", async () => {
		const body = Buffer.from(
			"89504e470d0a1a0a0000000d4948445200000001000000010806000000000000000000",
			"hex",
		);
		const assetUrl = storedImageAssetUrl(
			"image-1",
			claims.scrapeId,
			claims.ownerId,
			Date.now(),
			secret,
		);
		for (const [stored, status, code] of [
			[
				{ body, mimeType: "image/jpeg", byteLength: body.length },
				415,
				"UNSUPPORTED_MIME",
			],
			[
				{ body, mimeType: "image/png", byteLength: 1 },
				502,
				"STORED_BYTES_INVALID",
			],
			[
				{ body: Buffer.alloc(0), mimeType: "image/png", byteLength: 0 },
				502,
				"STORED_BYTES_INVALID",
			],
			[
				{
					body: Buffer.alloc(SCRAPE_MAX_ASSET_BYTES + 1),
					mimeType: "image/png",
					byteLength: SCRAPE_MAX_ASSET_BYTES + 1,
				},
				413,
				"ASSET_TOO_LARGE",
			],
		] as const) {
			const response = await GET(
				{ request: request(`http://app.example${assetUrl}`) },
				{
					secret,
					readStoredScrapeImage: async () => stored,
					getCapabilityOwner: async () => ({
						ownerId: claims.ownerId,
						active: true,
					}),
					checkRateLimit: async () => true,
				},
			);
			expect(response.status).toBe(status);
			expect((await response.json()).error.code).toBe(code);
		}
	});

	it("honors upstream date cooldowns and rejects invented retry delays", async () => {
		const token = issuePreviewAssetCapability(claims, secret);
		const now = Math.floor(Date.now() / 1000) * 1000;
		for (const [retryAfter, expected] of [
			[new Date(now + 20_000).toUTCString(), "20"],
			["invalid", null],
			["-4", null],
		] as const) {
			const response = await GET(
				{
					request: request(`http://app.example/api/scrape/asset?cap=${token}`),
				},
				{
					secret,
					now: () => now,
					getCapabilityOwner: async () => ({
						ownerId: claims.ownerId,
						active: true,
					}),
					checkRateLimit: async () => true,
					fetchAsset: async () => ({
						body: Buffer.alloc(0),
						status: 503,
						contentType: "text/plain",
						finalUrl: claims.target,
						retryAfter,
					}),
				},
			);
			expect(response.headers.get("retry-after")).toBe(expected);
		}
	});
	it("serves stored identity bytes without any remote fetch", async () => {
		const body = Buffer.from(
			"89504e470d0a1a0a0000000d4948445200000001000000010806000000000000000000",
			"hex",
		);
		const readStoredScrapeImage = vi.fn(async () => ({
			body,
			mimeType: "image/png",
			byteLength: body.length,
		}));
		const fetchAsset = vi.fn();
		const response = await GET(
			{
				request: request(
					`http://app.example${storedImageAssetUrl("image-1", claims.scrapeId, claims.ownerId, Date.now(), secret)}`,
				),
			},
			{
				secret,
				readStoredScrapeImage,
				fetchAsset,
				getCapabilityOwner: async () => ({
					ownerId: claims.ownerId,
					active: true,
				}),
				checkRateLimit: async () => true,
			},
		);
		expect(response.status).toBe(200);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
		expect(response.headers.get("content-length")).toBe(String(body.length));
		expect(readStoredScrapeImage).toHaveBeenCalledWith(
			claims.ownerId,
			claims.scrapeId,
			"image-1",
		);
		expect(fetchAsset).not.toHaveBeenCalled();
	});

	it("classifies expiry, revoked ownership, missing bytes and local cooldown without remote fallback", async () => {
		const now = Date.now();
		const assetUrl = storedImageAssetUrl(
			"image-1",
			claims.scrapeId,
			claims.ownerId,
			now,
			secret,
		);
		const fetchAsset = vi.fn();
		const base = {
			secret,
			now: () => now,
			fetchAsset,
			readStoredScrapeImage: async () => null,
			getCapabilityOwner: async () => ({
				ownerId: claims.ownerId,
				active: true,
			}),
			checkRateLimit: async () => true,
		};
		for (const [deps, status, code] of [
			[{ ...base, now: () => now + 86_400_000 }, 401, "CAPABILITY_EXPIRED"],
			[
				{ ...base, getCapabilityOwner: async () => null },
				401,
				"OWNERSHIP_DENIED",
			],
			[base, 404, "STORED_BYTES_MISSING"],
			[
				{ ...base, checkRateLimit: async () => false },
				429,
				"PROXY_RATE_LIMITED",
			],
		] as const) {
			const response = await GET(
				{ request: request(`http://app.example${assetUrl}`) },
				deps,
			);
			expect(response.status).toBe(status);
			const data = await response.json();
			expect(data.error.code).toBe(code);
			if (status === 429) {
				expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
				expect(data.error.retryAfterSeconds).toBe(
					Number(response.headers.get("retry-after")),
				);
			}
		}
		expect(fetchAsset).not.toHaveBeenCalled();
	});

	it("classifies upstream status, MIME, timeout, SSRF and retry hints without leaking errors", async () => {
		const token = issuePreviewAssetCapability(claims, secret);
		for (const [result, code, retry] of [
			[{ status: 403 }, "REMOTE_ACCESS_DENIED", null],
			[{ status: 404 }, "REMOTE_NOT_FOUND", null],
			[{ status: 429, retryAfter: "12" }, "REMOTE_RATE_LIMITED", "12"],
			[{ status: 200, contentType: "text/html" }, "UNSUPPORTED_MIME", null],
			[
				new ScrapeError("FETCH_TIMEOUT", "secret upstream URL"),
				"REMOTE_TIMEOUT",
				null,
			],
			[new ScrapeError("PRIVATE_URL_BLOCKED"), "URL_BLOCKED", null],
		] as const) {
			const response = await GET(
				{
					request: request(`http://app.example/api/scrape/asset?cap=${token}`),
				},
				{
					secret,
					getCapabilityOwner: async () => ({
						ownerId: claims.ownerId,
						active: true,
					}),
					checkRateLimit: async () => true,
					fetchAsset: async () => {
						if (result instanceof Error) throw result;
						return {
							body: Buffer.from("sample"),
							contentType: "image/png",
							finalUrl: claims.target,
							...result,
						};
					},
				},
			);
			expect((await response.json()).error.code).toBe(code);
			expect(response.headers.get("retry-after")).toBe(retry);
		}
	});
	it("serves a live exact capability without Origin-null cookies or ambient session", async () => {
		const token = issuePreviewAssetCapability(claims, secret);
		const fetchAsset = vi.fn(async (target: string) => ({
			body: Buffer.from("image bytes"),
			status: 200,
			contentType: "image/png",
			finalUrl: target,
		}));
		const response = await GET(
			{
				request: request(
					`http://app.example/api/scrape/asset?cap=${encodeURIComponent(token)}`,
					new Headers({ Origin: "null" }),
				),
			},
			{
				secret,
				getCapabilityOwner: vi.fn(async () => ({
					ownerId: claims.ownerId,
					active: true,
				})),
				checkRateLimit: vi.fn(async () => true),
				fetchAsset,
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("cache-control")).toMatch(/private|no-store/);
		expect(await response.text()).toBe("image bytes");
		expect(fetchAsset).toHaveBeenCalledWith(claims.target, expect.any(Object));
	});

	it("rejects unsigned, tampered, expired, unowned, deleted, or banned capabilities before fetch", async () => {
		const valid = issuePreviewAssetCapability(claims, secret);
		const fetchAsset = vi.fn(async () => ({
			body: Buffer.from("unexpected"),
			status: 200,
			contentType: "image/png",
			finalUrl: claims.target,
		}));
		const deps = {
			secret,
			requireUser: vi.fn(async () => {
				throw new Error("Unauthorized");
			}),
			getCapabilityOwner: vi.fn(async (scrapeId: string) => ({
				ownerId: scrapeId === "scrape-1" ? claims.ownerId : "other-owner",
				active: scrapeId === "scrape-1",
			})),
			checkRateLimit: vi.fn(async () => true),
			fetchAsset,
		};
		const cases = [
			request(
				"http://app.example/api/scrape/asset?url=https%3A%2F%2Fassets.example%2Fimage.png",
			),
			request(
				`http://app.example/api/scrape/asset?cap=${encodeURIComponent(`${valid}x`)}`,
			),
			request(
				`http://app.example/api/scrape/asset?cap=${encodeURIComponent(issuePreviewAssetCapability({ ...claims, expiresAt: Date.now() - 60_000 }, secret, Date.now() - 120_000))}`,
			),
			request(
				`http://app.example/api/scrape/asset?cap=${encodeURIComponent(issuePreviewAssetCapability({ ...claims, scrapeId: "deleted" }, secret))}`,
			),
		];
		for (const item of cases)
			expect((await GET({ request: item }, deps)).status).toBe(401);
		expect(fetchAsset).not.toHaveBeenCalled();
	});

	it("keeps legacy URL requests behind session auth and rejects unsupported document MIME", async () => {
		const fetchAsset = vi.fn(async (target: string) => ({
			body: Buffer.from("not executable in a same-origin response"),
			status: 200,
			contentType: "text/html",
			finalUrl: target,
		}));
		const unauthorized = await GET(
			{
				request: request(
					`http://app.example/api/scrape/asset?url=${encodeURIComponent(claims.target)}`,
				),
			},
			{
				requireUser: vi.fn(async () => {
					throw new Error("Unauthorized");
				}),
				fetchAsset,
			},
		);
		expect(unauthorized.status).toBe(401);
		const rejectedMime = await GET(
			{
				request: request(
					`http://app.example/api/scrape/asset?url=${encodeURIComponent(claims.target)}`,
				),
			},
			{
				requireUser: vi.fn(async () => ({
					id: claims.ownerId,
					email: "owner@example.com",
					name: "Owner",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
					isAdmin: false,
				})),
				checkRateLimit: vi.fn(async () => true),
				fetchAsset,
			},
		);
		expect(rejectedMime.status).toBe(415);
		expect(fetchAsset).toHaveBeenCalledOnce();
	});
});
