import { describe, expect, it } from "vitest";
import {
	issueStudioAssetCapability,
	verifyStudioAssetCapability,
} from "./studio-asset-capability";

describe("Studio Asset Capability", () => {
	const secret = "test-secret-at-least-16-bytes-long";

	it("issues and verifies a valid capability token", () => {
		const token = issueStudioAssetCapability(
			{ assetId: "asset-123", ownerId: "user-456" },
			secret,
		);
		expect(typeof token).toBe("string");
		expect(token.includes(".")).toBe(true);

		const claims = verifyStudioAssetCapability(token, secret);
		expect(claims).toEqual({
			assetId: "asset-123",
			ownerId: "user-456",
		});
	});

	it("rejects token with wrong secret", () => {
		const token = issueStudioAssetCapability(
			{ assetId: "asset-123", ownerId: "user-456" },
			secret,
		);
		const claims = verifyStudioAssetCapability(
			token,
			"different-secret-16-bytes-long",
		);
		expect(claims).toBeNull();
	});

	it("rejects tampered token payload", () => {
		const token = issueStudioAssetCapability(
			{ assetId: "asset-123", ownerId: "user-456" },
			secret,
		);
		const parts = token.split(".");
		const tamperedPayload = Buffer.from(
			JSON.stringify({ v: 1, assetId: "asset-999", ownerId: "user-456" }),
		).toString("base64url");
		const tamperedToken = `${tamperedPayload}.${parts[1]}`;

		expect(verifyStudioAssetCapability(tamperedToken, secret)).toBeNull();
	});

	it("rejects malformed token strings", () => {
		expect(verifyStudioAssetCapability("not-a-token", secret)).toBeNull();
		expect(verifyStudioAssetCapability("", secret)).toBeNull();
		expect(verifyStudioAssetCapability("a.b.c", secret)).toBeNull();
	});

	it("rejects empty claims on issue", () => {
		expect(() =>
			issueStudioAssetCapability({ assetId: "", ownerId: "user" }, secret),
		).toThrow();
		expect(() =>
			issueStudioAssetCapability({ assetId: "id", ownerId: "" }, secret),
		).toThrow();
	});
});
