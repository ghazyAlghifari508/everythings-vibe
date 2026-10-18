// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type MouseEvent, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerMock = {
	navigate: vi.fn(),
	history: { back: vi.fn(), canGoBack: vi.fn(() => false) },
};

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		replace,
		search,
		...rest
	}: {
		to: string;
		children?: ReactNode;
		replace?: boolean;
		search?: unknown;
		onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
	}) => {
		const anchorProps: Record<string, unknown> = { ...rest };
		return createElement(
			"a",
			{
				href: to,
				"data-to": to,
				"data-replace": String(replace),
				"data-search": search ? JSON.stringify(search) : undefined,
				...anchorProps,
			},
			children,
		);
	},
	useRouter: () => routerMock,
}));

import { ScrapeBackLink } from "../components/scrape-back-link";

afterEach(() => {
	cleanup();
	routerMock.history.back.mockReset();
	routerMock.history.canGoBack.mockReturnValue(false);
});

describe("ScrapeBackLink", () => {
	it.each([
		"/scrape/history",
		"/design/scrap/history",
	])("returns to canonical History from %s", (from) => {
		render(<ScrapeBackLink from={from} />);
		expect(screen.getByRole("link").dataset.to).toBe("/scrape/history");
	});

	it.each([
		"/scrape",
		"/design/scrap",
	])("returns to canonical Scrap from %s", (from) => {
		render(<ScrapeBackLink from={from} />);
		expect(screen.getByRole("link").dataset.to).toBe("/scrape");
	});

	it("falls back to Scrap for a direct URL or new tab", () => {
		render(<ScrapeBackLink />);
		expect(screen.getByRole("link").dataset.to).toBe("/scrape");
	});

	it("falls back to Scrap for an unsafe recorded destination", () => {
		render(<ScrapeBackLink from="https://evil.example" />);
		expect(screen.getByRole("link").dataset.to).toBe("/scrape");
	});

	it("uses the visible label Kembali", () => {
		render(<ScrapeBackLink />);
		expect(screen.getByRole("link").textContent).toMatch(/^Kembali$/);
	});

	it("honors the recorded origin even when an unrelated back entry exists", () => {
		routerMock.history.canGoBack.mockReturnValue(true);
		render(<ScrapeBackLink from="/design/scrap/history" />);
		fireEvent.click(screen.getByRole("link"));
		expect(routerMock.history.back).not.toHaveBeenCalled();
		expect(screen.getByRole("link").getAttribute("href")).toBe(
			"/scrape/history",
		);
		expect(screen.getByRole("link").dataset.replace).toBe("true");
	});

	it("navigates to the resolved route when no back entry exists", () => {
		routerMock.history.canGoBack.mockReturnValue(false);
		render(<ScrapeBackLink from="/design/scrap/history" />);
		fireEvent.click(screen.getByRole("link"));
		expect(routerMock.history.back).not.toHaveBeenCalled();
	});

	it.each([
		"/scrape/history",
		"/design/scrap/history",
	])("restores the history filter state when returning from %s", (from) => {
		render(
			<ScrapeBackLink
				from={from}
				historySearch={{
					mode: "html",
					status: "failed",
					q: "stitch",
					sort: "newest",
					page: 2,
					pageSize: 10,
				}}
			/>,
		);
		const link = screen.getByRole("link");
		expect(link.dataset.to).toBe("/scrape/history");
		expect(JSON.parse(link.dataset.search ?? "{}")).toEqual({
			mode: "html",
			status: "failed",
			q: "stitch",
			page: 2,
		});
	});

	it("ignores stored filters when returning to Scrap", () => {
		render(
			<ScrapeBackLink
				from="/design/scrap"
				historySearch={{
					mode: "html",
					q: "",
					sort: "newest",
					page: 3,
					pageSize: 10,
				}}
			/>,
		);
		const link = screen.getByRole("link");
		expect(link.dataset.to).toBe("/scrape");
		expect(link.dataset.search).toBeUndefined();
	});
});
