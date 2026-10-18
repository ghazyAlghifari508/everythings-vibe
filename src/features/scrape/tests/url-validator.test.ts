import { describe, expect, it } from "vitest";
import {
	isPrivateIp,
	normalizeUrl,
	parseAndValidateFormat,
} from "@/features/scrape/utils/url-validator";

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

	it("rejects values that are not absolute URLs", () => {
		for (const raw of [
			"",
			"   ",
			"example.com",
			"//example.com/x",
			"not a url",
		]) {
			expect(() => parseAndValidateFormat(raw), raw).toThrowError(
				expect.objectContaining({ code: "INVALID_URL" }),
			);
		}
	});

	it("rejects every scheme outside http and https", () => {
		for (const raw of [
			"ftp://example.com/x",
			"file:///etc/passwd",
			"javascript:alert(1)",
			"data:text/html,<b>x</b>",
		]) {
			expect(() => parseAndValidateFormat(raw), raw).toThrowError(
				expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
			);
		}
	});

	it("rejects destinations carrying credentials", () => {
		for (const raw of [
			"http://user:secret@example.com/",
			"https://user@example.com/",
		]) {
			expect(() => parseAndValidateFormat(raw), raw).toThrowError(
				expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
			);
		}
	});

	it("rejects loopback hostnames before DNS is ever consulted", () => {
		for (const raw of [
			"http://localhost/",
			"http://LOCALHOST:3000/admin",
			"http://app.localhost/",
			"http://ip6-localhost/",
		]) {
			expect(() => parseAndValidateFormat(raw), raw).toThrowError(
				expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
			);
		}
	});

	it("rejects private literal addresses", () => {
		for (const raw of [
			"http://127.0.0.1/",
			"http://10.1.2.3/",
			"http://172.20.0.1/",
			"http://192.168.0.5/",
			"http://169.254.169.254/latest/meta-data/",
			"http://100.100.0.1/",
			"http://0.0.0.0/",
			"http://[::1]/",
			"http://[fd00::1]/",
			"http://[fe80::1]/",
		]) {
			expect(() => parseAndValidateFormat(raw), raw).toThrowError(
				expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
			);
		}
	});

	it("accepts a public http or https destination", () => {
		expect(parseAndValidateFormat("https://example.com/a/b?q=1").href).toBe(
			"https://example.com/a/b?q=1",
		);
		expect(parseAndValidateFormat("  http://example.com:8080/x  ").port).toBe(
			"8080",
		);
	});
});

describe("normalizeUrl", () => {
	it("collapses one destination to a single canonical key", () => {
		expect(normalizeUrl(new URL("https://Example.COM/a/b///?q=1#frag"))).toBe(
			"https://example.com/a/b?q=1",
		);
		expect(normalizeUrl(new URL("https://example.com/"))).toBe(
			"https://example.com",
		);
		expect(normalizeUrl(new URL("http://example.com:8080/"))).toBe(
			"http://example.com:8080",
		);
	});
});
