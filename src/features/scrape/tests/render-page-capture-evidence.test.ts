import { afterAll, describe, expect, it } from "vitest";
import {
	closeRenderBrowser,
	renderPage,
} from "@/features/scrape/services/render-page";

afterAll(async () => {
	await closeRenderBrowser();
}, 60_000);

const FILLER = "<p>lorem ipsum dolor sit amet consectetur</p>".repeat(6);

function dataPage(body: string): string {
	return `data:text/html,${encodeURIComponent(`<html><body>${body}</body></html>`)}`;
}

describe("renderPage capture evidence", () => {
	it("reports no HTTP response for a document that never went over HTTP", async () => {
		const rendered = await renderPage(dataPage(FILLER), { mode: "html" });
		expect(rendered.responseReceived).toBe(false);
		expect(rendered.httpStatus).toBeUndefined();
	});

	it("records that resource loading settled for a clean document", async () => {
		const rendered = await renderPage(dataPage(FILLER), { mode: "html" });
		expect(rendered.resourceLoadTimedOut).toBe(false);
	});

	it("does not count a policy-blocked subresource as a failed asset fetch", async () => {
		const rendered = await renderPage(
			dataPage(`${FILLER}<img src="http://127.0.0.1:9/asset.png">`),
			{ mode: "html" },
		);
		expect(rendered.assetFetchFailures).toBe(0);
	});

	it("always exposes the real final URL of the captured document", async () => {
		const rendered = await renderPage(dataPage(FILLER), { mode: "html" });
		expect(rendered.finalUrl.startsWith("data:text/html")).toBe(true);
	});
});
