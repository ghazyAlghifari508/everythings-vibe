import { describe, expect, it } from "vitest";
import { isPrivateIp, parseAndValidateFormat } from "./url-validator";

describe("isPrivateIp", () => {
	it("blocks private direct and IPv4-mapped addresses", () => {
		for (const ip of [
			"::ffff:127.0.0.1",
			"::ffff:7f00:1",
			"::ffff:a00:1",
			"::ffff:ac10:1",
			"::ffff:c0a8:101",
			"::ffff:6440:1",
			"::ffff:a9fe:1",
			"0:0:0:0:0:ffff:c0a8:101",
			"0:0:0:0:0:ffff:7f00:0001",
			"0000:0000:0000:0000:0000:ffff:c0a8:0101",
			"0:0:0:0:0:ffff:192.168.1.1",
			"127.0.0.1",
			"10.0.0.1",
			"172.16.0.1",
			"192.168.1.1",
			"100.64.0.1",
			"::",
			"::1",
			"fc00::1",
			"fe80::1",
		]) {
			expect(isPrivateIp(ip), ip).toBe(true);
		}
	});

	it("keeps public mapped and direct IPv4 and IPv6 addresses unblocked", () => {
		for (const ip of ["::ffff:808:808", "8.8.8.8", "2606:4700:4700::1111"]) {
			expect(isPrivateIp(ip), ip).toBe(false);
		}
	});
});

describe("parseAndValidateFormat", () => {
	it("rejects IPv4-mapped private IPv6 URLs with PRIVATE_URL_BLOCKED", () => {
		for (const raw of [
			"http://[::ffff:127.0.0.1]/",
			"http://[::ffff:7f00:1]/",
			"http://[::ffff:192.168.1.1]/",
			"http://[::ffff:c0a8:101]/",
		]) {
			expect(() => parseAndValidateFormat(raw)).toThrowError(
				expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
			);
		}
	});
});
