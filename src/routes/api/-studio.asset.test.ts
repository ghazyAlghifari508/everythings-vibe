import { describe, expect, it } from "vitest";
import { issueStudioAssetCapability } from "@/lib/studio-asset-capability";
import { GET, OPTIONS } from "./studio.asset";

describe("Studio Asset Route", () => {
	const secret = "test-secret-at-least-16-bytes-long";
	const sampleData = Buffer.from("fake-png-bytes").toString("base64");
	const mockAsset = {
		id: "asset-1",
		mimeType: "image/png",
		byteLength: 14,
		data: sampleData,
	};

	it("serves asset when requested with a valid capability token", async () => {
		const cap = issueStudioAssetCapability(
			{ assetId: "asset-1", ownerId: "user-123" },
			secret,
		);
		const req = new Request(
			`https://app.test/api/studio/asset?id=asset-1&cap=${cap}`,
		);

		const res = await GET(
			{ request: req },
			{
				secret,
				dbSelectAsset: async (id, userId) => {
					if (id === "asset-1" && userId === "user-123") return mockAsset;
					return null;
				},
			},
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
		const body = await res.arrayBuffer();
		expect(Buffer.from(body).toString("utf8")).toBe("fake-png-bytes");
	});

	it("serves asset when requested with an authenticated user session", async () => {
		const req = new Request("https://app.test/api/studio/asset?id=asset-1");

		const res = await GET(
			{ request: req },
			{
				getUserFromSession: async () => ({ user: { id: "user-123" } }),
				dbSelectAsset: async (id, userId) => {
					if (id === "asset-1" && userId === "user-123") return mockAsset;
					return null;
				},
			},
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
	});

	it("rejects request missing both capability and session", async () => {
		const req = new Request("https://app.test/api/studio/asset?id=asset-1");

		const res = await GET(
			{ request: req },
			{
				getUserFromSession: async () => null,
			},
		);

		expect(res.status).toBe(401);
	});

	it("rejects capability token for a different asset id", async () => {
		const cap = issueStudioAssetCapability(
			{ assetId: "asset-other", ownerId: "user-123" },
			secret,
		);
		const req = new Request(
			`https://app.test/api/studio/asset?id=asset-1&cap=${cap}`,
		);

		const res = await GET({ request: req }, { secret });
		expect(res.status).toBe(401);
	});

	it("returns 404 when asset does not exist or user does not own it", async () => {
		const cap = issueStudioAssetCapability(
			{ assetId: "asset-missing", ownerId: "user-123" },
			secret,
		);
		const req = new Request(
			`https://app.test/api/studio/asset?id=asset-missing&cap=${cap}`,
		);

		const res = await GET(
			{ request: req },
			{
				secret,
				dbSelectAsset: async () => null,
			},
		);

		expect(res.status).toBe(404);
	});

	it("returns 400 when id param is omitted", async () => {
		const req = new Request("https://app.test/api/studio/asset");
		const res = await GET({ request: req });
		expect(res.status).toBe(400);
	});

	it("responds to OPTIONS with CORS headers", () => {
		const res = OPTIONS();
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});
