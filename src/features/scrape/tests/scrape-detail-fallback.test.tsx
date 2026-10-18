// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The detail route's fallback surfaces are asserted by rendering, which needs a
// DOM. Kept in its own file so the loader-level suite in `scrap.$id.test.tsx`
// stays on the cheaper node environment.
const route = vi.hoisted(() => ({
	useLoaderData: vi.fn(),
	useParams: vi.fn(() => ({ id: "scrape-1" })),
	useSearch: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) =>
		Object.assign({ options }, route),
	Link: () => null,
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({ handler: (handler: unknown) => handler }),
	}),
}));
vi.mock("@/lib/session", () => ({ requireUserServer: vi.fn() }));
vi.mock("@/features/scrape/services/scrape-service", () => ({
	getScrapeById: vi.fn(),
	getScrapeResults: vi.fn(),
}));
vi.mock("@/features/scrape/utils/scrape-preview-document", () => ({
	buildScrapePreviewDocument: vi.fn(),
}));

import { ScrapeDetailErrorView } from "@/features/scrape/components/scrape-detail-view";
import { Route } from "@/routes/scrape/$id";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("scrape detail fallback state", () => {
	it("renders the dedicated not-found surface when the detail load fails", () => {
		expect(Route.options.errorComponent).toBe(ScrapeDetailErrorView);
	});

	it("refuses to render the detail shell without loader data", () => {
		const Page = Route.options.component;
		if (typeof Page !== "function")
			throw new Error("Route component unavailable");
		route.useLoaderData.mockReturnValue(undefined);

		expect(() => render(createElement(Page))).toThrowError("NOT_FOUND");
	});
});
