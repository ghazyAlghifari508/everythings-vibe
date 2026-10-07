// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	SCRAPE_STATUS_INDONESIAN_LABELS,
	ScrapeHistoryList,
} from "./scrape-history-list";

afterEach(() => {
	cleanup();
});

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
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

const sampleItems = [
	{
		id: "scrape-1",
		sourceUrl: "https://linear.app",
		domain: "linear.app",
		title: "Linear — Issue Tracking",
		status: "completed",
		createdAt: new Date().toISOString(),
	},
	{
		id: "scrape-2",
		sourceUrl: "https://stripe.com",
		domain: "stripe.com",
		title: "Stripe Payment Infrastructure",
		status: "failed",
		createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
	},
	{
		id: "scrape-3",
		sourceUrl: "https://example.com",
		domain: "example.com",
		title: null,
		status: "generating",
		createdAt: new Date(Date.now() - 1000 * 60).toISOString(),
	},
];

describe("ScrapeHistoryList Component", () => {
	it("renders list of scrape records with domain, title, and Indonesian status", () => {
		render(<ScrapeHistoryList initialItems={sampleItems} onDelete={vi.fn()} />);

		expect(screen.getByText("Linear — Issue Tracking")).toBeDefined();
		expect(screen.getByText("https://linear.app")).toBeDefined();
		expect(screen.getByText(SCRAPE_STATUS_INDONESIAN_LABELS.completed)).toBeDefined();

		expect(screen.getByText("Stripe Payment Infrastructure")).toBeDefined();
		expect(screen.getByText(SCRAPE_STATUS_INDONESIAN_LABELS.failed)).toBeDefined();

		expect(screen.getByText("example.com")).toBeDefined();
		expect(screen.getByText(SCRAPE_STATUS_INDONESIAN_LABELS.generating)).toBeDefined();
	});

	it("shows empty state when no items exist", () => {
		render(<ScrapeHistoryList initialItems={[]} onDelete={vi.fn()} />);

		expect(screen.getByText(/Belum ada riwayat scrape/i)).toBeDefined();
		expect(screen.getByRole("link", { name: /Mulai Scrap Sekarang/i })).toBeDefined();
	});

	it("triggers delete confirmation and calls onDelete handler", async () => {
		const onDeleteMock = vi.fn().mockResolvedValue(true);
		render(<ScrapeHistoryList initialItems={sampleItems} onDelete={onDeleteMock} />);

		const deleteButtons = screen.getAllByRole("button", { name: /Hapus riwayat/i });
		fireEvent.click(deleteButtons[0]);

		// Confirm delete dialog button
		const confirmBtn = screen.getByRole("button", { name: /Konfirmasi Hapus/i });
		fireEvent.click(confirmBtn);

		expect(onDeleteMock).toHaveBeenCalledWith("scrape-1");
	});
});
