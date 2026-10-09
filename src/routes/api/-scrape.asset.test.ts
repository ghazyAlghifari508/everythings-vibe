import { describe, expect, it, vi } from "vitest";
import { issuePreviewAssetCapability } from "@/lib/preview-capabilities";
import { GET } from "./scrape.asset";

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
