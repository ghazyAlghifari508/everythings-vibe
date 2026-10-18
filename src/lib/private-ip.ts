import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"ip6-localhost",
	"ip6-loopback",
]);

/** A loopback hostname that must never be dialled, before DNS resolution. */
export function isBlockedHostname(host: string): boolean {
	const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
	return BLOCKED_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost");
}

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
