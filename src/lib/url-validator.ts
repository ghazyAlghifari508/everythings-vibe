import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ScrapeError } from "@/lib/design-errors";
import { isBlockedHostname, isPrivateIp } from "@/lib/private-ip";

export { isPrivateIp };

export function parseAndValidateFormat(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new ScrapeError("INVALID_URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new ScrapeError("PRIVATE_URL_BLOCKED");
	}
	if (url.username || url.password)
		throw new ScrapeError("PRIVATE_URL_BLOCKED");
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (isBlockedHostname(host)) {
		throw new ScrapeError("PRIVATE_URL_BLOCKED");
	}
	if (isIP(host) && isPrivateIp(host)) {
		throw new ScrapeError("PRIVATE_URL_BLOCKED");
	}
	return url;
}

export function normalizeUrl(url: URL): string {
	const path = url.pathname.replace(/\/+$/, "");
	return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}${path}${url.search}`;
}

export async function validateUrl(
	raw: string,
): Promise<{ url: URL; normalized: string; ip: string }> {
	const url = parseAndValidateFormat(raw);
	const host = url.hostname.replace(/^\[|\]$/g, "");

	let ip = host;
	if (!isIP(host)) {
		try {
			const addresses = await lookup(host, { all: true });
			if (
				!addresses.length ||
				addresses.some(({ address }) => isPrivateIp(address))
			) {
				throw new ScrapeError("PRIVATE_URL_BLOCKED");
			}
			ip = addresses[0].address;
		} catch (err) {
			if (err instanceof ScrapeError) throw err;
			throw new ScrapeError("WEBSITE_BLOCKED");
		}
	}
	if (isPrivateIp(ip)) {
		throw new ScrapeError("PRIVATE_URL_BLOCKED");
	}
	return { url, normalized: normalizeUrl(url), ip };
}

const hostBlockCache = new Map<string, { blocked: boolean; at: number }>();
const HOST_CACHE_TTL_MS = 60_000;

/**
 * Whether a subresource URL points outside the public internet. Unresolvable
 * hosts are treated as blocked so a DNS failure can never widen the surface.
 * Kept out of the browser session module so a caller that only needs the
 * destination guard never loads the Chromium driver.
 */
export async function isBlockedRequestUrl(raw: string): Promise<boolean> {
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return true;
	}
	if (parsed.protocol === "data:" || parsed.protocol === "blob:") return false;
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
	const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (isBlockedHostname(host)) return true;
	if (isIP(host)) return isPrivateIp(host);

	const cached = hostBlockCache.get(host);
	if (cached && Date.now() - cached.at < HOST_CACHE_TTL_MS)
		return cached.blocked;
	let blocked: boolean;
	try {
		const addresses = await lookup(host, { all: true });
		blocked =
			!addresses.length ||
			addresses.some(({ address }) => isPrivateIp(address));
	} catch {
		blocked = true;
	}
	hostBlockCache.set(host, { blocked, at: Date.now() });
	return blocked;
}
