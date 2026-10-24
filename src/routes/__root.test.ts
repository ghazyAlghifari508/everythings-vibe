import { describe, expect, it } from "vitest";
import { Route } from "./__root";

describe("Root route metadata and favicons", () => {
	it("provides canonical everythings-vibe title and favicon assets in head", () => {
		const headFn = Route.options.head;
		expect(headFn).toBeDefined();

		const head = typeof headFn === "function" ? headFn({} as never) : headFn;
		expect(head).toBeDefined();

		const titleMeta = head?.meta?.find(
			(m: Record<string, unknown>) => "title" in m,
		) as { title?: string } | undefined;
		expect(titleMeta?.title).toBe(
			"everythings-vibe - All-in-One AI Vibe-Coding Workspace",
		);

		const svgFavicon = head?.links?.find(
			(l: Record<string, unknown>) => l.type === "image/svg+xml",
		);
		expect(svgFavicon?.href).toBe("/favicon.svg");

		const pngFavicon = head?.links?.find(
			(l: Record<string, unknown>) => l.type === "image/png",
		);
		expect(pngFavicon?.href).toBe("/favicon.png");
	});
});
