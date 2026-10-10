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
		...rest
	}: {
		to: string;
		children?: ReactNode;
		replace?: boolean;
		onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
	}) => {
		const anchorProps: Record<string, unknown> = { ...rest };
		return createElement(
			"a",
			{
				href: to,
				"data-to": to,
				"data-replace": String(replace),
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
});
