import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const TOKEN_DOMAIN = "everythings-vibe/studio-asset/v1\0";
const MAX_TOKEN_CHARS = 4096;

export interface StudioAssetClaims {
	assetId: string;
	ownerId: string;
}

function signingKey(secret: string): Buffer {
	if (Buffer.byteLength(secret) < 16) {
		throw new Error("Studio capability secret is unavailable or too short");
	}
	return Buffer.from(secret, "utf8");
}

function resolveSecret(secret?: string): string {
	const candidate =
		secret ||
		process.env.BETTER_AUTH_SECRET ||
		process.env.AUTH_SECRET ||
		"dev-studio-secret-key-32-bytes-long!!";
	return candidate;
}

export function issueStudioAssetCapability(
	claims: StudioAssetClaims,
	secret?: string,
): string {
	if (!claims.assetId || !claims.ownerId) {
		throw new Error("Invalid studio asset claims");
	}
	const payload = Buffer.from(
		JSON.stringify({
			v: TOKEN_VERSION,
			assetId: claims.assetId,
			ownerId: claims.ownerId,
		}),
		"utf8",
	).toString("base64url");

	const sig = createHmac("sha256", signingKey(resolveSecret(secret)))
		.update(TOKEN_DOMAIN)
		.update(payload)
		.digest("base64url");

	return `${payload}.${sig}`;
}

export function verifyStudioAssetCapability(
	token: string,
	secret?: string,
): StudioAssetClaims | null {
	if (!token || token.length > MAX_TOKEN_CHARS) return null;
	const dotIndex = token.indexOf(".");
	if (dotIndex < 1 || dotIndex !== token.lastIndexOf(".")) return null;

	const payloadStr = token.slice(0, dotIndex);
	const sigStr = token.slice(dotIndex + 1);

	try {
		const wantedSig = createHmac("sha256", signingKey(resolveSecret(secret)))
			.update(TOKEN_DOMAIN)
			.update(payloadStr)
			.digest("base64url");

		const sigBuf = Buffer.from(sigStr, "utf8");
		const wantedBuf = Buffer.from(wantedSig, "utf8");
		if (
			sigBuf.length !== wantedBuf.length ||
			!timingSafeEqual(sigBuf, wantedBuf)
		) {
			return null;
		}

		const json = JSON.parse(
			Buffer.from(payloadStr, "base64url").toString("utf8"),
		) as Record<string, unknown>;

		if (
			json.v !== TOKEN_VERSION ||
			typeof json.assetId !== "string" ||
			typeof json.ownerId !== "string" ||
			!json.assetId ||
			!json.ownerId
		) {
			return null;
		}

		return {
			assetId: json.assetId,
			ownerId: json.ownerId,
		};
	} catch {
		return null;
	}
}
