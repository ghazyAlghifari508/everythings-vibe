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

import { StudioBackLink } from "@/features/studio/components/workspace/studio-back-link";

afterEach(() => {
	cleanup();
	routerMock.history.back.mockReset();
	routerMock.history.canGoBack.mockReturnValue(false);
});

describe("StudioBackLink", () => {
	it("returns to templates when the landing was opened from templates", () => {
		render(<StudioBackLink from="/templates" />);
		expect(screen.getByRole("link").dataset.to).toBe("/templates");
	});

	it("falls back to home for a direct URL or new tab", () => {
		render(<StudioBackLink />);
		expect(screen.getByRole("link").dataset.to).toBe("/");
	});

	it("falls back to home for an unsafe recorded destination", () => {
		render(<StudioBackLink from="https://evil.example" />);
		expect(screen.getByRole("link").dataset.to).toBe("/");
	});

	it("uses the visible label Kembali", () => {
		render(<StudioBackLink />);
		expect(screen.getByRole("link").textContent).toMatch(/^Kembali$/);
	});

	it("honors the recorded origin even when an unrelated back entry exists", () => {
		routerMock.history.canGoBack.mockReturnValue(true);
		render(<StudioBackLink from="/templates" />);
		fireEvent.click(screen.getByRole("link"));
		expect(routerMock.history.back).not.toHaveBeenCalled();
		expect(screen.getByRole("link").getAttribute("href")).toBe("/templates");
		expect(screen.getByRole("link").dataset.replace).toBe("true");
	});

	it("navigates to the resolved route when no back entry exists", () => {
		routerMock.history.canGoBack.mockReturnValue(false);
		render(<StudioBackLink from="/templates" />);
		fireEvent.click(screen.getByRole("link"));
		expect(routerMock.history.back).not.toHaveBeenCalled();
	});
});
