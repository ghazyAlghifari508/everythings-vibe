// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({
		options,
		useSearch: () => ({}),
	}),
	useNavigate: () => vi.fn(async () => {}),
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

import { Route } from "@/routes/scrape/index";

function ScrapIndexComponent(): React.ComponentType {
	const Component = Route.options.component;
	if (!Component) throw new Error("Scrape route must render its workspace");
	return Component;
}

afterEach(() => {
	cleanup();
});

describe("scrap index heading stability & contextual navigation", () => {
	it("renders contextual breadcrumb navigating to Home and showing VibeScrape", () => {
		const Component = ScrapIndexComponent();
		render(<Component />);

		const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(breadcrumb).toBeDefined();

		const homeLink = screen.getByRole("link", { name: "Home" });
		expect(homeLink.getAttribute("href")).toBe("/");

		const currentItem = screen.getByText("VibeScrape");
		expect(currentItem.getAttribute("aria-current")).toBe("page");
	});

	it("renders a single static action-oriented heading with supporting description", () => {
		const Component = ScrapIndexComponent();
		render(<Component />);
		const headings = screen.getAllByRole("heading", {
			name: "Ekstrak website",
		});
		expect(headings.length).toBe(1);
		expect(headings[0].tagName).toBe("H1");
		expect(
			screen.getByText(
				"Ambil struktur halaman, panduan desain, HTML, atau gambar dari URL website.",
			),
		).toBeDefined();
	});

	it("keeps the same heading when the extraction mode changes", () => {
		const Component = ScrapIndexComponent();
		render(<Component />);
		fireEvent.click(screen.getByRole("tab", { name: /crawl website/i }));
		fireEvent.click(screen.getByRole("tab", { name: /scrape images/i }));
		const headings = screen.getAllByRole("heading", {
			name: "Ekstrak website",
		});
		expect(headings.length).toBe(1);
	});

	it("renders compact form input wrapper and submit button sizing classes", () => {
		const Component = ScrapIndexComponent();
		const { container } = render(<Component />);

		const inputWrapper = container.querySelector(
			'div.h-11.sm\\:h-12, div[class*="h-11"][class*="sm:h-12"]',
		);
		expect(inputWrapper).not.toBeNull();

		const submitButton = screen.getByRole("button", {
			name: /jalankan generate/i,
		});
		expect(submitButton.className).toContain("size-11");
		expect(submitButton.className).toContain("sm:size-12");
	});
});
