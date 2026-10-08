// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeHistoryList } from "./scrape-history-list";

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
}));

afterEach(() => {
	cleanup();
});

describe("ScrapeHistoryList", () => {
	it("renders an empty state with a contrast-safe CTA and no dashed dropzone", () => {
		const { container } = render(<ScrapeHistoryList initialItems={[]} />);
		expect(
			screen.getByRole("heading", { name: /Belum ada riwayat scrape/i }),
		).toBeDefined();
		const cta = screen.getByRole("link", { name: /Mulai Scrap Sekarang/i });
		expect(cta.className).toContain("btn-primary");
		expect(container.innerHTML).not.toContain("border-dashed");
	});

	it("uses the website name instead of the SEO page title with plain metadata", () => {
		const { container } = render(
			<ScrapeHistoryList
				initialItems={[
					{
						id: "id-1",
						sourceUrl: "https://www.notion.com/",
						domain: "www.notion.com",
						title: "The AI workspace that works for you. | Notion",
						status: "completed",
						mode: "design",
						createdAt: new Date().toISOString(),
					},
				]}
			/>,
		);
		expect(screen.getByText("Notion")).toBeDefined();
		expect(
			screen.queryByText("The AI workspace that works for you. | Notion"),
		).toBeNull();
		expect(screen.getByText(/DESIGN\.md · Selesai/)).toBeDefined();
		expect(screen.queryByRole("link", { name: /^Buka$/i })).toBeNull();
		expect(
			screen.getByRole("button", { name: /Hapus riwayat/i }),
		).toBeDefined();
		const html = container.innerHTML;
		expect(html).not.toContain("rounded-full");
		expect(html).not.toContain("bg-emerald-400");
		expect(html).not.toContain("bg-sky-500");
		expect(html).not.toContain("bg-purple-500");
	});

	it("makes the whole row the open target pointing at the result route", () => {
		render(
			<ScrapeHistoryList
				initialItems={[
					{
						id: "id-2",
						sourceUrl: "https://www.notion.com/",
						domain: "www.notion.com",
						title: null,
						status: "completed",
						mode: "html",
						createdAt: new Date().toISOString(),
					},
				]}
			/>,
		);
		const rowLink = screen.getByRole("link", { name: /Notion/i });
		expect(rowLink.getAttribute("href")).toBe("/design/scrap/$id");
		expect(screen.getByText(/HTML · Selesai/)).toBeDefined();
	});
});
