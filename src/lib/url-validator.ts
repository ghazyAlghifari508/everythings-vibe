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

	const normalized = s.replace(/(\d+\.\d+\.\d+\.\d+)$/, (ipv4) => {
		const [a, b, c, d] = ipv4.split(".").map(Number);
		return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	});
	const separator = normalized.indexOf("::");
	const left = normalized
		.slice(0, separator < 0 ? undefined : separator)
		.split(":")
		.filter(Boolean);
	const right =
		separator < 0
			? []
			: normalized
					.slice(separator + 2)
					.split(":")
					.filter(Boolean);
	const groups = [
		...left,
		...Array(Math.max(0, 8 - left.length - right.length)).fill("0"),
		...right,
	];
	if (
		groups.length === 8 &&
		Number.parseInt(groups[0], 16) === 0 &&
		Number.parseInt(groups[1], 16) === 0 &&
		Number.parseInt(groups[2], 16) === 0 &&
		Number.parseInt(groups[3], 16) === 0 &&
		Number.parseInt(groups[4], 16) === 0 &&
		Number.parseInt(groups[5], 16) === 0xffff
	) {
		const high = Number.parseInt(groups[6], 16);
		const low = Number.parseInt(groups[7], 16);
		return isPrivateIPv4(
			`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`,
		);
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
