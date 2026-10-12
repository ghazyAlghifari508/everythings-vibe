import { expect, it } from "vitest";
import {
	closeRenderBrowser,
	httpStatusMessage,
	renderPage,
} from "./render-page";

it("classifies upstream HTTP status with an actionable message", async () => {
	expect(httpStatusMessage(429, 120)).toContain("120");
	expect(httpStatusMessage(429)).toContain("429");
	expect(httpStatusMessage(403)).toContain("menolak akses");
	expect(httpStatusMessage(404)).toContain("tidak ditemukan");
	expect(httpStatusMessage(503)).toContain("server");
	const filler = "<p>lorem ipsum dolor sit amet consectetur</p>".repeat(6);
	const target = `data:text/html,${encodeURIComponent(
		`<html><body>${filler}</body></html>`,
	)}`;
	const rendered = await renderPage(target, { mode: "html" });
	expect(rendered.status).toBe(200);
	await closeRenderBrowser();
}, 60_000);
