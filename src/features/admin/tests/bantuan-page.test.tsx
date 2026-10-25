// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BantuanPage } from "@/routes/bantuan";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
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

function linkHrefs(): Array<string | null> {
	return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

afterEach(() => {
	cleanup();
});

describe("BantuanPage public access & admin triage removal", () => {
	it("never renders admin triage or staff-only links for any visitor", () => {
		render(<BantuanPage />);

		expect(linkHrefs()).not.toContain("/admin/feedback");
		expect(screen.queryByText(/Triase Admin/i)).toBeNull();
		expect(screen.queryByText(/Khusus staf admin/i)).toBeNull();
	});

	it("keeps feedback, billing, and faq links accessible while eliminating breadcrumb home link", () => {
		render(<BantuanPage />);

		const hrefs = linkHrefs();
		expect(hrefs).toContain("/settings/feedback");
		expect(hrefs).toContain("/settings/billing");
		expect(hrefs).toContain("/faq");
		expect(hrefs).not.toContain("/");
		expect(
			screen.queryByRole("navigation", { name: /breadcrumb/i }),
		).toBeNull();
	});

	it("does not render the awkward isolated billing paragraph", () => {
		render(<BantuanPage />);

		expect(
			screen.queryByText(/Butuh bantuan soal pembayaran atau tagihan/i),
		).toBeNull();
		expect(screen.queryByText(/Buka pengaturan billing/i)).toBeNull();
	});
});

describe("BantuanPage Information Architecture & Guides", () => {
	it("renders main headings and structured support section", () => {
		render(<BantuanPage />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Pusat Bantuan" }),
		).toBeDefined();
		expect(screen.getByText("Panduan Penggunaan")).toBeDefined();
		expect(screen.getByText("Dukungan & Bantuan")).toBeDefined();
		expect(
			screen.getByText("Laporkan Masalah atau Kirim Masukan"),
		).toBeDefined();
		expect(screen.getByText("Tagihan & Pembayaran")).toBeDefined();
		expect(screen.getByText("Pertanyaan Umum (FAQ)")).toBeDefined();
	});

	it("renders all four core product help topics", () => {
		render(<BantuanPage />);

		expect(screen.getByText("Alur Kerja VibePlan")).toBeDefined();
		expect(screen.getByText("Alur Kerja VibeDesign")).toBeDefined();
		expect(screen.getByText("Alur Kerja VibeScrape")).toBeDefined();
		expect(screen.getByText("Alur Kerja everythings-vibe CLI")).toBeDefined();
	});

	it("defaults to VibePlan guide and allows selecting another guide", () => {
		render(<BantuanPage />);

		// Default active guide is VibePlan
		expect(
			screen.getByRole("heading", {
				level: 3,
				name: /Panduan Langkah: Alur Kerja VibePlan/i,
			}),
		).toBeDefined();
		expect(screen.getByText(/Inisiasi ide produk/i)).toBeDefined();

		// Click to select VibeDesign
		const buttons = screen.getAllByRole("button");
		const vibeDesignBtn = buttons.find((btn) =>
			btn.closest("article")?.textContent?.includes("VibeDesign"),
		);
		expect(vibeDesignBtn).toBeDefined();

		if (vibeDesignBtn) {
			fireEvent.click(vibeDesignBtn);
		}

		expect(
			screen.getByRole("heading", {
				level: 3,
				name: /Panduan Langkah: Alur Kerja VibeDesign/i,
			}),
		).toBeDefined();
		expect(screen.getByText(/Inspeksi kanvas multi-screen/i)).toBeDefined();
	});

	it("does not duplicate FAQ question accordion or embed full FAQ entries", () => {
		render(<BantuanPage />);

		// FAQ should only be linked, not embedded as FAQ accordion items
		expect(screen.queryByText(/Apakah credit memiliki masa aktif/i)).toBeNull();
		expect(screen.queryByText(/Bagaimana cara kerja patch PRD/i)).toBeNull();
	});
});
