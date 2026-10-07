// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HtmlScraper } from "./html-scraper";

const mockNavigate = vi.fn();

afterEach(() => {
	cleanup();
});

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

describe("HtmlScraper Action-First UI", () => {
	it("renders action-first form with URL input and submit CTA", () => {
		render(<HtmlScraper />);

		const input = screen.getByPlaceholderText(/https:\/\/example\.com/i);
		expect(input).toBeDefined();

		const button = screen.getByRole("button", { name: /Scrap website/i });
		expect(button).toBeDefined();
		expect(button.textContent).toContain("Scrap website");
	});

	it("does not render any history rows or riwayat section", () => {
		const { container } = render(<HtmlScraper />);

		expect(screen.queryByText(/Riwayat scrape/i)).toBeNull();
		expect(screen.queryByText(/Belum ada scrape/i)).toBeNull();
		expect(container.querySelectorAll("li").length).toBe(0);
	});

	it("disables submit button when URL is empty", () => {
		render(<HtmlScraper />);

		const button = screen.getByRole("button", { name: /Scrap website/i });
		expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("enables submit button when valid URL is entered", () => {
		render(<HtmlScraper />);

		const input = screen.getByPlaceholderText(/https:\/\/example\.com/i);
		fireEvent.change(input, { target: { value: "https://example.com" } });

		const button = screen.getByRole("button", { name: /Scrap website/i });
		expect(button.hasAttribute("disabled")).toBe(false);
	});
});
