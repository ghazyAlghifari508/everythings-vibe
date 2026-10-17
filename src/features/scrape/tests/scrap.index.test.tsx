// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => ({
		options,
		useSearch: () => ({}),
	}),
	useNavigate: () => vi.fn(async () => {}),
}));

import { Route } from "@/routes/design/scrap.index";

function ScrapIndexComponent(): React.ComponentType {
	const options = Route.options as unknown as {
		component: React.ComponentType;
	};
	return options.component;
}

afterEach(() => {
	cleanup();
});

describe("scrap index heading stability", () => {
	it("renders a single static heading", () => {
		const Component = ScrapIndexComponent();
		render(<Component />);
		const headings = screen.getAllByRole("heading", {
			name: "Website Extraction Workspace",
		});
		expect(headings.length).toBe(1);
		expect(headings[0].tagName).toBe("H1");
	});

	it("keeps the same heading when the extraction mode changes", () => {
		const Component = ScrapIndexComponent();
		render(<Component />);
		fireEvent.click(screen.getByRole("tab", { name: /crawl website/i }));
		fireEvent.click(screen.getByRole("tab", { name: /scrape images/i }));
		const headings = screen.getAllByRole("heading", {
			name: "Website Extraction Workspace",
		});
		expect(headings.length).toBe(1);
	});
});
