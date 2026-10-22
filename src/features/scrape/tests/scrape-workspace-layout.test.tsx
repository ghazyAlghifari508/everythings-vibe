// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
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
	useNavigate: () => vi.fn(async () => {}),
}));

import { ScrapeWorkspaceView } from "@/features/scrape/components/scrape-workspace-view";

afterEach(() => {
	cleanup();
});

function breadcrumbColumn(): Element {
	const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
	const column = breadcrumb.parentElement;
	if (!column) throw new Error("Breadcrumb must live inside a content column");
	return column;
}

describe("scrape workspace content column", () => {
	it("keeps the breadcrumb inside the same content column as the form", () => {
		const { container } = render(<ScrapeWorkspaceView initialMode="design" />);

		const page = screen.getByRole("main");
		const form = container.querySelector("form");
		expect(form).not.toBeNull();

		// The breadcrumb must not hang off the wide page shell: it belongs to
		// the narrow content column that also holds the form.
		const column = breadcrumbColumn();
		expect(column).not.toBe(page);
		expect(column.contains(form)).toBe(true);
	});

	it("keeps the mode switcher and the form in the shared column", () => {
		const { container } = render(<ScrapeWorkspaceView initialMode="design" />);

		const column = breadcrumbColumn();
		const tablist = screen.getByRole("tablist", { name: "Pilih mode" });
		const form = container.querySelector("form");

		expect(column.contains(tablist)).toBe(true);
		expect(column.contains(form)).toBe(true);
	});

	it("renders exactly one breadcrumb trail", () => {
		render(<ScrapeWorkspaceView initialMode="design" />);

		expect(
			screen.getAllByRole("navigation", { name: "Breadcrumb" }),
		).toHaveLength(1);
	});

	it("keeps the breadcrumb navigation target and the current page marker", () => {
		render(<ScrapeWorkspaceView initialMode="design" />);

		expect(
			screen.getByRole("link", { name: "Home" }).getAttribute("href"),
		).toBe("/");
		expect(screen.getByText("VibeScrape").getAttribute("aria-current")).toBe(
			"page",
		);
	});
});
