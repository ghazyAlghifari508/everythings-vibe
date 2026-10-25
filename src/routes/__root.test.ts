import { describe, expect, it } from "vitest";
import { Route } from "./__root";

describe("Root route metadata and favicons", () => {
	it("provides canonical everythings-vibe title and favicon assets in head", async () => {
		const headFn = Route.options.head;
		expect(headFn).toBeDefined();

		const head = typeof headFn === "function" ? headFn({} as never) : headFn;
		const resolvedHead = await Promise.resolve(head);
		expect(resolvedHead).toBeDefined();

		const titleMeta = resolvedHead?.meta?.find((m) =>
			Boolean(m && "title" in m),
		) as { title?: string } | undefined;
		expect(titleMeta?.title).toBe(
			"everythings-vibe - All-in-One AI Vibe-Coding Workspace",
		);

		const svgFavicon = resolvedHead?.links?.find(
			(l) => l?.type === "image/svg+xml",
		);
		expect(svgFavicon?.href).toBe("/favicon.svg");

		const pngFavicon = resolvedHead?.links?.find(
			(l) => l?.type === "image/png",
		);
		expect(pngFavicon?.href).toBe("/favicon.png");
	});
});
