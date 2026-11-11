import { JSDOM } from "jsdom";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioFrameRow } from "@/db/schema";
import { exportProjectAsZip } from "../services/studio-export";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
	url: "https://studio.test",
});
dom.window.document.addEventListener("click", (event) =>
	event.preventDefault(),
);
const frame: StudioFrameRow = {
	id: "frame",
	projectId: "project",
	name: "Home",
	description: null,
	viewport: "web",
	status: "ready",
	htmlCode: "<html><body>STALE</body></html>",
	order: 0,
	error: null,
	attempts: 0,
	visualHash: null,
	promptHash: null,
	originJobId: null,
	initialSlot: null,
	revision: 1,
	lastJobId: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

beforeEach(() => {
	vi.stubGlobal("document", dom.window.document);
	vi.stubGlobal("setTimeout", vi.fn());
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("P5 authoritative standalone ZIP", () => {
	it.each([
		() => new Response(null, { status: 500 }),
		() => Response.json({ html: "" }),
		() => Response.json({ error: "No document" }),
	])("rejects unavailable final HTML instead of exporting stale persisted bytes", async (response) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => response()),
		);
		await expect(
			exportProjectAsZip("Project", "project", [frame]),
		).rejects.toThrow();
		expect(URL.createObjectURL).not.toHaveBeenCalled();
	});

	it("preserves finalized CSS, fonts, mode and every private asset reference in the ZIP", async () => {
		const html =
			'<!DOCTYPE html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><style id="studio-canonical-style">[data-studio-shell]{--app-gutter:24px;--app-content-width:1200px}.hero{background-image:url(/api/studio/asset?id=cover&amp;cap=1);aspect-ratio:16/10}</style></head><body><div data-studio-shell data-studio-layout="public-website"><main data-studio-content><img src="/api/studio/asset?id=cover&amp;cap=1" srcset="/api/studio/asset?id=cover&amp;cap=1 1x" alt="Cover"></main></div></body></html>';
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				url.includes("document=1")
					? Response.json({ html, viewport: "web" })
					: new Response(new Uint8Array([137, 80, 78, 71]), {
							headers: { "Content-Type": "image/png" },
						}),
			),
		);
		await exportProjectAsZip("Project", "project", [frame]);
		const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0];
		if (!(blob instanceof Blob)) throw new Error("ZIP download missing");
		const zip = await JSZip.loadAsync(await blob.arrayBuffer());
		const shipped = await zip.file("index.html")?.async("string");
		expect(shipped).toBe(
			html.replaceAll(
				"/api/studio/asset?id=cover&amp;cap=1",
				"./assets/asset-1.png",
			),
		);
		expect(await zip.file("assets/asset-1.png")?.async("uint8array")).toEqual(
			new Uint8Array([137, 80, 78, 71]),
		);
		const manifestFile = zip.file("project-manifest.json");
		if (!manifestFile) throw new Error("Export manifest missing");
		const manifest = JSON.parse(await manifestFile.async("string"));
		expect(manifest).toMatchObject({
			offlineReady: false,
			externalDependencies: ["fonts.googleapis.com"],
			screens: [{ viewport: "web", file: "1-home.html" }],
		});
	});
});
