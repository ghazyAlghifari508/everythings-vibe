// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrapModeSwitcher } from "./scrap-mode-switcher";

const mockNavigate = vi.fn();

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

describe("ScrapModeSwitcher UI and Accessible Tabs", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders tablist with default Generate DESIGN.md selected", () => {
		render(<ScrapModeSwitcher />);

		const tablist = screen.getByRole("tablist", { name: /Pilih mode/i });
		expect(tablist).toBeDefined();

		const designTab = screen.getByRole("tab", { name: /Generate DESIGN\.md/i });
		const htmlTab = screen.getByRole("tab", { name: /Scrape HTML/i });

		expect(designTab.getAttribute("aria-selected")).toBe("true");
		expect(designTab.getAttribute("tabIndex")).toBe("0");
		expect(htmlTab.getAttribute("aria-selected")).toBe("false");
		expect(htmlTab.getAttribute("tabIndex")).toBe("-1");

		const designPanel = document.getElementById("design-panel");
		const htmlPanel = document.getElementById("html-panel");
		expect(designPanel?.hasAttribute("hidden")).toBe(false);
		expect(htmlPanel?.hasAttribute("hidden")).toBe(true);

		// Default helper copy for DESIGN.md
		expect(
			screen.getByText(/Website publik · DESIGN\.md untuk AI coding/i),
		).toBeDefined();
	});

	it("switches to Scrape HTML tab on click and updates aria attributes", () => {
		render(<ScrapModeSwitcher />);

		const designTab = screen.getByRole("tab", { name: /Generate DESIGN\.md/i });
		const htmlTab = screen.getByRole("tab", { name: /Scrape HTML/i });

		fireEvent.click(htmlTab);

		expect(htmlTab.getAttribute("aria-selected")).toBe("true");
		expect(htmlTab.getAttribute("tabIndex")).toBe("0");
		expect(designTab.getAttribute("aria-selected")).toBe("false");
		expect(designTab.getAttribute("tabIndex")).toBe("-1");

		const designPanel = document.getElementById("design-panel");
		const htmlPanel = document.getElementById("html-panel");
		expect(designPanel?.hasAttribute("hidden")).toBe(true);
		expect(htmlPanel?.hasAttribute("hidden")).toBe(false);

		// Helper copy for Scrape HTML
		expect(
			screen.getByText(/Website publik · Preview HTML · index\.html/i),
		).toBeDefined();
	});

	it("supports keyboard navigation (ArrowRight, ArrowLeft, Home, End)", () => {
		render(<ScrapModeSwitcher />);

		const designTab = screen.getByRole("tab", { name: /Generate DESIGN\.md/i });
		const htmlTab = screen.getByRole("tab", { name: /Scrape HTML/i });

		// ArrowRight moves from design to html
		fireEvent.keyDown(designTab, { key: "ArrowRight" });
		expect(htmlTab.getAttribute("aria-selected")).toBe("true");

		// ArrowRight loops from html back to design
		fireEvent.keyDown(htmlTab, { key: "ArrowRight" });
		expect(designTab.getAttribute("aria-selected")).toBe("true");

		// ArrowLeft loops from design to html
		fireEvent.keyDown(designTab, { key: "ArrowLeft" });
		expect(htmlTab.getAttribute("aria-selected")).toBe("true");

		// ArrowLeft moves from html back to design
		fireEvent.keyDown(htmlTab, { key: "ArrowLeft" });
		expect(designTab.getAttribute("aria-selected")).toBe("true");

		// End moves to html tab
		fireEvent.keyDown(designTab, { key: "End" });
		expect(htmlTab.getAttribute("aria-selected")).toBe("true");

		// Home moves to design tab
		fireEvent.keyDown(htmlTab, { key: "Home" });
		expect(designTab.getAttribute("aria-selected")).toBe("true");
	});

	it("preserves input values across tab switches without unmounting", () => {
		render(<ScrapModeSwitcher />);

		const designInput = screen.getByLabelText(
			/Website yang ingin di-generate DESIGN\.md/i,
		) as HTMLInputElement;
		fireEvent.change(designInput, { target: { value: "https://stripe.com" } });
		expect(designInput.value).toBe("https://stripe.com");

		const htmlTab = screen.getByRole("tab", { name: /Scrape HTML/i });
		fireEvent.click(htmlTab);

		const htmlInput = screen.getByLabelText(
			/Website yang ingin di-scrape HTML/i,
		) as HTMLInputElement;
		fireEvent.change(htmlInput, { target: { value: "https://linear.app" } });
		expect(htmlInput.value).toBe("https://linear.app");

		const designTab = screen.getByRole("tab", { name: /Generate DESIGN\.md/i });
		fireEvent.click(designTab);

		// Input in design tab is preserved
		expect(designInput.value).toBe("https://stripe.com");

		// Switch back to html tab, input is preserved
		fireEvent.click(htmlTab);
		expect(htmlInput.value).toBe("https://linear.app");
	});

	it("submits design mode with canonical mode payload", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ scrapeId: "scrape-design-123", mode: "design" }),
		});
		global.fetch = fetchMock;

		render(<ScrapModeSwitcher />);

		const designInput = screen.getByLabelText(
			/Website yang ingin di-generate DESIGN\.md/i,
		);
		fireEvent.change(designInput, { target: { value: "https://example.com" } });

		const submitBtn = screen.getByRole("button", { name: /Buat DESIGN\.md/i });
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/scrape",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url: "https://example.com", mode: "design" }),
				}),
			);
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/design/scrap/$id",
			params: { id: "scrape-design-123" },
		});
	});

	it("submits html mode with canonical mode payload", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ scrapeId: "scrape-html-456", mode: "html" }),
		});
		global.fetch = fetchMock;

		render(<ScrapModeSwitcher />);

		const htmlTab = screen.getByRole("tab", { name: /Scrape HTML/i });
		fireEvent.click(htmlTab);

		const htmlInput = screen.getByLabelText(
			/Website yang ingin di-scrape HTML/i,
		);
		fireEvent.change(htmlInput, { target: { value: "https://example.org" } });

		const submitBtn = screen.getByRole("button", { name: /Scrape HTML/i });
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/scrape",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url: "https://example.org", mode: "html" }),
				}),
			);
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/design/scrap/$id",
			params: { id: "scrape-html-456" },
		});
	});
});
