import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	isBlockedRequestUrl,
	validateUrl,
} from "@/features/scrape/utils/url-validator";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }));

// The resolver is the only way an attacker can turn a public hostname into an
// internal destination, so every DNS answer shape must be decided here.
describe("validateUrl destination guard", () => {
	beforeEach(() => {
		dns.lookup.mockReset();
	});

	it("pins the request to the resolved address of a public host", async () => {
		dns.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
		const result = await validateUrl("https://Example.com/Docs/?q=1");
		expect(dns.lookup).toHaveBeenCalledWith("example.com", { all: true });
		expect(result.ip).toBe("93.184.216.34");
		expect(result.normalized).toBe("https://example.com/Docs?q=1");
	});

	it.each([
		["a private IPv4 answer", [{ address: "10.0.0.7" }]],
		["a loopback answer", [{ address: "127.0.0.1" }]],
		["an IPv6 loopback answer", [{ address: "::1" }]],
		[
			"a mixed public and private answer",
			[{ address: "93.184.216.34" }, { address: "192.168.1.5" }],
		],
	])("blocks a public hostname that resolves to %s", async (_label, answers) => {
		dns.lookup.mockResolvedValue(answers);
		await expect(validateUrl("https://rebind.example/")).rejects.toThrowError(
			expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
		);
	});

	it("blocks an empty DNS answer instead of dialling the raw hostname", async () => {
		dns.lookup.mockResolvedValue([]);
		await expect(validateUrl("https://empty.example/")).rejects.toThrowError(
			expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
		);
	});

	it("classifies an unresolvable host as a blocked website, not a private one", async () => {
		dns.lookup.mockRejectedValue(
			Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
		);
		await expect(validateUrl("https://gone.example/")).rejects.toThrowError(
			expect.objectContaining({ code: "WEBSITE_BLOCKED" }),
		);
	});

	it("never consults DNS for a literal address", async () => {
		await expect(validateUrl("http://8.8.8.8/x")).resolves.toMatchObject({
			ip: "8.8.8.8",
		});
		await expect(validateUrl("http://127.0.0.1/x")).rejects.toThrowError(
			expect.objectContaining({ code: "PRIVATE_URL_BLOCKED" }),
		);
		expect(dns.lookup).not.toHaveBeenCalled();
	});
});

describe("isBlockedRequestUrl", () => {
	beforeEach(() => {
		dns.lookup.mockReset();
	});

	it("treats an unresolvable host as blocked so a DNS failure cannot widen access", async () => {
		dns.lookup.mockRejectedValue(new Error("getaddrinfo EAI_AGAIN"));
		await expect(
			isBlockedRequestUrl("https://unresolved.example/a.png"),
		).resolves.toBe(true);
	});

	it("blocks a subresource host that resolves to a private address", async () => {
		dns.lookup.mockResolvedValue([{ address: "192.168.10.4" }]);
		await expect(
			isBlockedRequestUrl("https://internal.example/a.png"),
		).resolves.toBe(true);
	});

	it("resolves a host once per cached window for repeated subresources", async () => {
		dns.lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
		await expect(
			isBlockedRequestUrl("https://cdn.example/a.png"),
		).resolves.toBe(false);
		await expect(
			isBlockedRequestUrl("https://cdn.example/b.png"),
		).resolves.toBe(false);
		expect(dns.lookup).toHaveBeenCalledOnce();
	});
});
