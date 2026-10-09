import { createHmac, timingSafeEqual } from "node:crypto";
import { init as initModuleLexer, parse as parseModule } from "es-module-lexer";
import {
	SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS,
	SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS,
} from "@/lib/constants";
import { rewriteCssUrls, rewritePreviewAssets } from "@/lib/preview-html";
import { parseAndValidateFormat } from "@/lib/url-validator";

const TOKEN_VERSION = 1;
const TOKEN_MAX_CHARS = 8192;
const TOKEN_DOMAIN = "everythings-vibe/scrape-preview-asset/v1\0";

export interface PreviewAssetClaims {
	scrapeId: string;
	ownerId: string;
	target: string;
	expiresAt: number;
}

export interface PreviewAssetExpected {
	now?: number;
	scrapeId?: string;
	ownerId?: string;
	target?: string;
}

export interface PreviewRewriteOptions {
	baseUrl: string;
	appOrigin: string;
	scrapeId: string;
	ownerId: string;
	secret?: string;
	expiresAt: number;
}

function canonicalTarget(value: string): string {
	if (value.length > SCRAPE_PREVIEW_ASSET_MAX_URL_CHARS)
		throw new Error("Preview resource URL exceeds limit");
	const parsed = parseAndValidateFormat(value);
	if (parsed.username || parsed.password || parsed.href !== value)
		throw new Error("Preview resource URL is not canonical");
	return parsed.href;
}

function signingKey(secret: string): Buffer {
	if (Buffer.byteLength(secret) < 32)
		throw new Error("Preview capability secret is unavailable");
	return Buffer.from(secret, "utf8");
}

function signature(payload: string, secret: string): Buffer {
	return createHmac("sha256", signingKey(secret))
		.update(TOKEN_DOMAIN)
		.update(payload)
		.digest();
}

export function issuePreviewAssetCapability(
	claims: PreviewAssetClaims,
	secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "",
	now = Date.now(),
): string {
	const target = canonicalTarget(claims.target);
	if (
		!claims.scrapeId ||
		claims.scrapeId.length > 200 ||
		!claims.ownerId ||
		claims.ownerId.length > 200 ||
		typeof claims.expiresAt !== "number" ||
		!Number.isSafeInteger(claims.expiresAt) ||
		claims.expiresAt <= now ||
		claims.expiresAt - now > SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS
	)
		throw new Error("Invalid preview capability claims");
	const payload = Buffer.from(
		JSON.stringify({ v: TOKEN_VERSION, ...claims, target }),
		"utf8",
	).toString("base64url");
	const token = `${payload}.${signature(payload, secret).toString("base64url")}`;
	if (token.length > TOKEN_MAX_CHARS)
		throw new Error("Preview capability exceeds limit");
	return token;
}

export function verifyPreviewAssetCapability(
	token: string,
	secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "",
	expected: PreviewAssetExpected = {},
): PreviewAssetClaims | null {
	if (!token || token.length > TOKEN_MAX_CHARS) return null;
	const separator = token.indexOf(".");
	if (separator < 1 || separator !== token.lastIndexOf(".")) return null;
	const payload = token.slice(0, separator);
	const encodedSignature = token.slice(separator + 1);
	if (
		!/^[A-Za-z0-9_-]+$/.test(payload) ||
		!/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)
	)
		return null;

	try {
		const received = Buffer.from(encodedSignature, "base64url");
		if (received.toString("base64url") !== encodedSignature) return null;
		const wanted = signature(payload, secret);
		if (received.length !== wanted.length || !timingSafeEqual(received, wanted))
			return null;
		const bytes = Buffer.from(payload, "base64url");
		if (bytes.toString("base64url") !== payload) return null;
		const value: unknown = JSON.parse(bytes.toString("utf8"));
		if (!value || typeof value !== "object" || Array.isArray(value))
			return null;
		const data = value as Record<string, unknown>;
		const now = expected.now ?? Date.now();
		if (
			data.v !== TOKEN_VERSION ||
			typeof data.scrapeId !== "string" ||
			!data.scrapeId ||
			data.scrapeId.length > 200 ||
			typeof data.ownerId !== "string" ||
			!data.ownerId ||
			data.ownerId.length > 200 ||
			typeof data.target !== "string" ||
			typeof data.expiresAt !== "number" ||
			!Number.isSafeInteger(data.expiresAt) ||
			data.expiresAt <= now ||
			data.expiresAt - now > SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS
		)
			return null;
		const target = canonicalTarget(data.target);
		if (
			target !== data.target ||
			(expected.scrapeId !== undefined &&
				data.scrapeId !== expected.scrapeId) ||
			(expected.ownerId !== undefined && data.ownerId !== expected.ownerId) ||
			(expected.target !== undefined && target !== expected.target)
		)
			return null;
		return {
			scrapeId: data.scrapeId,
			ownerId: data.ownerId,
			target,
			expiresAt: data.expiresAt,
		};
	} catch {
		return null;
	}
}

export function capabilityUrl(
	target: string,
	options: PreviewRewriteOptions,
): string {
	const token = issuePreviewAssetCapability(
		{
			scrapeId: options.scrapeId,
			ownerId: options.ownerId,
			target: canonicalTarget(target),
			expiresAt: options.expiresAt,
		},
		options.secret,
	);
	const origin = new URL(options.appOrigin);
	if (origin.protocol !== "https:" && origin.protocol !== "http:")
		throw new Error("Invalid preview app origin");
	return `${origin.origin}/api/scrape/asset?cap=${encodeURIComponent(token)}`;
}

export function buildPreviewSrcDoc(
	html: string,
	options: PreviewRewriteOptions,
): string {
	const capabilities = new Map<string, string>();
	const resolve = (target: string) => {
		let absolute: string;
		try {
			absolute = canonicalTarget(target);
		} catch {
			return target;
		}
		let capability = capabilities.get(absolute);
		if (!capability) {
			capability = capabilityUrl(absolute, options);
			capabilities.set(absolute, capability);
		}
		return capability;
	};
	return rewritePreviewAssets(html, options.baseUrl, resolve, capabilities);
}

export function rewritePreviewCss(
	css: string,
	finalUrl: string,
	options: PreviewRewriteOptions,
): string {
	return rewriteCssUrls(css, finalUrl, (target) =>
		capabilityUrl(target, options),
	);
}

export async function rewritePreviewModule(
	source: string,
	finalUrl: string,
	options: PreviewRewriteOptions,
): Promise<string> {
	await initModuleLexer;
	const [imports] = parseModule(source, finalUrl);
	const replacements: Array<{ start: number; end: number; value: string }> = [];
	for (const item of imports) {
		if (item.d === -2) {
			if (source.slice(item.e, item.e + 4) === ".url")
				replacements.push({
					start: item.s,
					end: item.e + 4,
					value: JSON.stringify(finalUrl),
				});
			continue;
		}
		if (item.n === undefined) continue;
		const dynamic = item.d >= 0;
		const openQuote = dynamic ? source[item.s] : source[item.s - 1];
		if (openQuote !== '"' && openQuote !== "'") continue;
		const closeQuote = dynamic ? source[item.e - 1] : source[item.e];
		if (closeQuote !== openQuote) continue;
		const literalStart = dynamic ? item.s : item.s - 1;
		const literalEnd = dynamic ? item.e : item.e + 1;
		if (
			!item.n.startsWith("./") &&
			!item.n.startsWith("../") &&
			!item.n.startsWith("/") &&
			!/^https?:\/\//i.test(item.n)
		)
			continue;
		let target: string;
		try {
			target = canonicalTarget(new URL(item.n, finalUrl).href);
		} catch {
			continue;
		}
		if (new URL(target).pathname === "/api/scrape/asset") continue;
		replacements.push({
			start: literalStart,
			end: literalEnd,
			value: JSON.stringify(capabilityUrl(target, options)),
		});
	}
	let output = source;
	for (const item of replacements.sort((a, b) => b.start - a.start))
		output = output.slice(0, item.start) + item.value + output.slice(item.end);
	return output;
}
