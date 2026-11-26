// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpHome } from "@/features/help/components/help-home";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	Outlet: () => null,
	Link: ({
		children,
		to,
		className,
		onMouseEnter,
	}: {
		children: ReactNode;
		to: string;
		className?: string;
		onMouseEnter?: () => void;
	}) => (
		<a href={to} className={className} onMouseEnter={onMouseEnter}>
			{children}
		</a>
	),
	useNavigate: () => navigateMock,
}));

function linkHrefs(): Array<string | null> {
	return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

function searchInput(): HTMLInputElement {
	return screen.getByRole("combobox", {
		name: "Cari panduan bantuan",
	}) as HTMLInputElement;
}

afterEach(() => {
	cleanup();
	navigateMock.mockClear();
});

describe("Help Center public access", () => {
	it("never renders admin triage or staff-only links", () => {
		render(<HelpHome />);

		expect(linkHrefs()).not.toContain("/admin/feedback");
		expect(screen.queryByText(/Triase Admin/i)).toBeNull();
		expect(screen.queryByText(/Khusus staf admin/i)).toBeNull();
	});

	it("keeps feedback, billing, and FAQ links without a root breadcrumb", () => {
		render(<HelpHome />);

		const hrefs = linkHrefs();
		expect(hrefs).toContain("/settings/feedback");
		expect(hrefs).toContain("/settings/billing");
		expect(hrefs).toContain("/faq");
		expect(hrefs).not.toContain("/");
		expect(
			screen.queryByRole("navigation", { name: /breadcrumb/i }),
		).toBeNull();
	});

	it("does not duplicate FAQ questions or embed the FAQ accordion", () => {
		render(<HelpHome />);

		expect(screen.queryByText(/Apakah credit memiliki masa aktif/i)).toBeNull();
		expect(screen.queryByText(/Bagaimana cara kerja patch PRD/i)).toBeNull();
	});
});

describe("Help Center information architecture", () => {
	it("renders a compact task-oriented homepage", () => {
		render(<HelpHome />);

		expect(
			screen.getByRole("heading", {
				level: 1,
				name: "Apa yang bisa kami bantu?",
			}),
		).toBeDefined();
		expect(
			screen.getByRole("heading", {
				level: 2,
				name: "Mulai menggunakan EVVIBE",
			}),
		).toBeDefined();
		expect(
			screen.getByRole("heading", { level: 2, name: "Jelajahi panduan" }),
		).toBeDefined();
		expect(
			screen.getByRole("heading", {
				level: 2,
				name: "Masih mengalami kendala?",
			}),
		).toBeDefined();
		expect(
			screen.queryByText(/Panduan Langkah: Alur Kerja VibePlan/i),
		).toBeNull();
		expect(screen.queryByText(/Inisiasi ide produk/i)).toBeNull();
		expect(screen.queryByText(/Inspeksi kanvas multi-screen/i)).toBeNull();
	});

	it("links starters and every product category to real destinations", () => {
		render(<HelpHome />);

		const hrefs = linkHrefs();
		expect(hrefs).toContain("/bantuan/mulai/mengenal-evvibe");
		expect(hrefs).toContain("/bantuan/mulai/proyek-pertama");
		expect(hrefs).toContain("/bantuan/mulai/kredit-untuk-pemula");
		expect(hrefs).toContain("/bantuan/vibeplan");
		expect(hrefs).toContain("/bantuan/studio");
		expect(hrefs).toContain("/bantuan/scrape");
		expect(hrefs).toContain("/bantuan/template");
		expect(hrefs).toContain("/bantuan/cli");
		expect(hrefs).toContain("/bantuan/billing");
	});
});

describe("Help Center local search", () => {
	it("returns a relevant article link for a real task query", () => {
		render(<HelpHome />);

		fireEvent.change(searchInput(), { target: { value: "kredit habis" } });

		const results = screen.getByRole("listbox", {
			name: "Hasil pencarian bantuan",
		});
		expect(
			screen.getByRole("option", { name: /Cara kerja pemotongan kredit/i }),
		).toBeDefined();
		expect(
			within(results)
				.getByRole("link", {
					name: /Cara kerja pemotongan kredit/i,
				})
				.getAttribute("href"),
		).toBe("/bantuan/billing/cara-kerja-kredit");
	});

	it("shows an empty state instead of fake suggestions", () => {
		render(<HelpHome />);

		fireEvent.change(searchInput(), {
			target: { value: "resep masakan rendang" },
		});

		expect(screen.getByText(/Tidak ada panduan untuk/i)).toBeDefined();
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("opens the active guide when Enter is pressed in the search input", () => {
		render(<HelpHome />);

		const input = searchInput();
		fireEvent.change(input, { target: { value: "revisi desain" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(navigateMock).toHaveBeenCalledWith({
			href: "/bantuan/studio/revisi-desain",
		});
	});

	it("supports keyboard navigation and Enter to open the active guide", () => {
		render(<HelpHome />);

		const input = searchInput();
		fireEvent.change(input, { target: { value: "revisi desain" } });
		const options = screen.getAllByRole("option");
		expect(options[0]?.getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(options[1]?.getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(input, { key: "ArrowUp" });
		expect(options[0]?.getAttribute("aria-selected")).toBe("true");

		const searchElement = input.closest("search");
		expect(searchElement).not.toBeNull();
		if (searchElement) fireEvent.submit(searchElement);
		expect(navigateMock).toHaveBeenCalledWith({
			href: "/bantuan/studio/revisi-desain",
		});
	});

	it("closes the result list when the user clicks outside search", () => {
		render(<HelpHome />);

		const input = searchInput();
		fireEvent.change(input, { target: { value: "revisi desain" } });
		expect(screen.getByRole("listbox")).toBeDefined();

		fireEvent.pointerDown(document.body);

		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("clears the query and hides results", () => {
		render(<HelpHome />);

		const input = searchInput();
		fireEvent.change(input, { target: { value: "generate prd" } });
		expect(screen.getByRole("listbox")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Hapus pencarian" }));

		expect(input.value).toBe("");
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});
