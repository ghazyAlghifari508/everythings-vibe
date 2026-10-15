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

import { ScrapeBackLink } from "./scrape-back-link";

afterEach(() => {
	cleanup();
	routerMock.history.back.mockReset();
	routerMock.history.canGoBack.mockReturnValue(false);
});

describe("ScrapeBackLink", () => {
	it("returns to History when the result was opened from History", () => {
		render(<ScrapeBackLink from="/design/scrap/history" />);
		expect(screen.getByRole("link").dataset.to).toBe("/design/scrap/history");
	});

	it("returns to Scrap when the result was opened from Scrap", () => {
		render(<ScrapeBackLink from="/design/scrap" />);
		expect(screen.getByRole("link").dataset.to).toBe("/design/scrap");
	});

	it("falls back to Scrap for a direct URL or new tab", () => {
		render(<ScrapeBackLink />);
		expect(screen.getByRole("link").dataset.to).toBe("/design/scrap");
	});

	it("falls back to Scrap for an unsafe recorded destination", () => {
		render(<ScrapeBackLink from="https://evil.example" />);
		expect(screen.getByRole("link").dataset.to).toBe("/design/scrap");
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
			"/design/scrap/history",
		);
		expect(screen.getByRole("link").dataset.replace).toBe("true");
	});

	it("navigates to the resolved route when no back entry exists", () => {
		routerMock.history.canGoBack.mockReturnValue(false);
		render(<ScrapeBackLink from="/design/scrap/history" />);
		fireEvent.click(screen.getByRole("link"));
		expect(routerMock.history.back).not.toHaveBeenCalled();
	});

	it("restores the history filter state when returning from History", () => {
		render(
			<ScrapeBackLink
				from="/design/scrap/history"
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
		expect(link.dataset.to).toBe("/design/scrap/history");
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
		expect(link.dataset.to).toBe("/design/scrap");
		expect(link.dataset.search).toBeUndefined();
	});
});
