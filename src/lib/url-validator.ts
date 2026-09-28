import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ScrapeError } from "@/lib/design-errors";
const BLOCKED_HOSTNAMES: Record<string, true> = {
	localhost: true,
	"ip6-localhost": true,
	"ip6-loopback": true,
};

export function isPrivateIp(ip: string): boolean {
	const v = isIP(ip);
	if (v === 4) return isPrivateIPv4(ip);
	if (v === 6) return isPrivateIPv6(ip);
	return false;
}

function isPrivateIPv4(ip: string): boolean {
	const p = ip.split(".").map(Number);
	if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255))
		return true;
	const [a, b] = p;
	if (a === 0) return true;
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const s = ip.toLowerCase();
	if (s === "::1" || s === "::") return true;

	const first = Number.parseInt(s.split(":")[0] || "0", 16);
	if (first >= 0xfe80 && first <= 0xfebf) return true;
	if (first >= 0xfc00 && first <= 0xfdff) return true;

	if (s.includes("::ffff:")) {
		const tail = s.slice(s.lastIndexOf(":") + 1);
		if (tail.includes(".")) return isPrivateIPv4(tail);
		const mapped = Number.parseInt(tail || "0", 16);
		if (mapped >> 8 === 127) return true;
	}
	return false;
}

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
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (BLOCKED_HOSTNAMES[host] || host.endsWith(".localhost")) {
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
