import { describe, expect, it } from "vitest";
import { DESKTOP_VIEWPORT, isBlockedRequestUrl } from "./render-page";

describe("isBlockedRequestUrl", () => {
	it("blocks localhost and loopback targets", async () => {
		await expect(isBlockedRequestUrl("http://localhost:3000/")).resolves.toBe(
			true,
		);
		await expect(isBlockedRequestUrl("http://127.0.0.1/")).resolves.toBe(true);
		await expect(isBlockedRequestUrl("http://[::1]/")).resolves.toBe(true);
	});

	it("blocks private RFC1918 and metadata targets", async () => {
		await expect(isBlockedRequestUrl("http://10.0.0.5/")).resolves.toBe(true);
		await expect(isBlockedRequestUrl("http://192.168.1.10/")).resolves.toBe(
			true,
		);
		await expect(isBlockedRequestUrl("http://169.254.169.254/")).resolves.toBe(
			true,
		);
	});

	it("blocks non-http(s) subresource schemes", async () => {
		await expect(isBlockedRequestUrl("javascript:alert(1)")).resolves.toBe(
			true,
		);
		await expect(isBlockedRequestUrl("ftp://example.com/x")).resolves.toBe(
			true,
		);
	});

	it("allows data and blob payloads plus public IP literals", async () => {
		await expect(
			isBlockedRequestUrl("data:image/png;base64,AAA"),
		).resolves.toBe(false);
		await expect(isBlockedRequestUrl("blob:https://x/y")).resolves.toBe(false);
		await expect(isBlockedRequestUrl("https://8.8.8.8/")).resolves.toBe(false);
	});
});

describe("DESKTOP_VIEWPORT", () => {
	it("captures at a fixed 1440px desktop width", () => {
		expect(DESKTOP_VIEWPORT.width).toBe(1440);
		expect(DESKTOP_VIEWPORT.height).toBe(900);
	});
});

describe("renderPage", () => {
	it("returns rendered DOM with client JavaScript executed", async () => {
		const { renderPage } = await import("./render-page");
		const filler = "<p>lorem ipsum dolor sit amet</p>".repeat(20);
		const target = `data:text/html,${encodeURIComponent(
			`<html><head><title>smoke</title></head><body><div id="root"></div>${filler}<script>document.getElementById("root").textContent = "rendered-by-js";</script></body></html>`,
		)}`;
		const rendered = await renderPage(target);
		expect(rendered.html).toContain("rendered-by-js");
		expect(rendered.status).toBe(200);
	}, 60_000);
});
