import { afterEach, expect, it, vi } from "vitest";
import { FIXTURE } from "./design-fixture";
import { closeRenderBrowser, renderPage } from "./render-page";

const capture = vi.hoisted(() => ({
	contextOptions: vi.fn(),
	evidenceLimits: vi.fn(),
	close: vi.fn(),
	fail: false,
}));
vi.mock("playwright", () => ({
	chromium: {
		launch: async () => ({
			on: () => {},
			close: async () => {},
			newContext: async (options: unknown) => {
				capture.contextOptions(options);
				return {
					addInitScript: async () => {},
					route: async () => {},
					close: async () => {
						capture.close();
					},
					newPage: async () => ({
						goto: async () => ({ status: () => 200, headers: () => ({}) }),
						waitForLoadState: async () => {},
						waitForTimeout: async () => {},
						url: () => "https://sample.example/",
						content: async () => {
							if (capture.fail) throw new Error("read failed");
							return "<html><body>Sample readable content</body></html>";
						},
						evaluate: async (_fn: unknown, limits: unknown) => {
							if (
								typeof limits === "object" &&
								limits !== null &&
								"elements" in limits
							) {
								capture.evidenceLimits(limits);
								return FIXTURE;
							}
						},
					}),
				};
			},
		}),
	},
}));

afterEach(async () => {
	await closeRenderBrowser();
	vi.clearAllMocks();
	capture.fail = false;
});

it("applies capture preferences and detailed bounds at the browser boundary and closes the context", async () => {
	await renderPage("https://sample.example/", {
		viewport: { width: 390, height: 844 },
		colorScheme: "dark",
		evidenceDepth: "detailed",
	});
	expect(capture.contextOptions).toHaveBeenCalledWith(
		expect.objectContaining({
			viewport: { width: 390, height: 844 },
			colorScheme: "dark",
		}),
	);
	expect(capture.evidenceLimits).toHaveBeenCalledWith(
		expect.objectContaining({
			elements: 500,
			scanElements: 10000,
			fonts: 100,
			variables: 200,
		}),
	);
	expect(capture.close).toHaveBeenCalledTimes(1);
});

it("closes a failed capture context before propagating the failure", async () => {
	capture.fail = true;
	await expect(renderPage("https://sample.example/")).rejects.toMatchObject({
		code: "CAPTURE_FAILED",
	});
	expect(capture.close).toHaveBeenCalledTimes(1);
});
