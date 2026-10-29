// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import type { StudioScreenSuggestion } from "@/features/studio/services/studio-screen-suggestions";

const SUGGESTIONS: StudioScreenSuggestion[] = [
	{
		id: "add-screen:catat-transaksi",
		label: "Buat Catat Transaksi",
		prompt:
			"Buat satu halaman Catat Transaksi untuk CatatDompet. Sediakan formulir pencatatan dengan nominal, tanggal, kategori, sumber dana, catatan, dan daftar transaksi terbaru. Ikuti desain, navigasi, dan komponen aplikasi yang sudah ada. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'PRD menyebut "transaksi"',
	},
	{
		id: "add-screen:anggaran",
		label: "Buat Anggaran",
		prompt:
			"Buat satu halaman Anggaran untuk CatatDompet. Tampilkan daftar kategori anggaran dengan batas, realisasi, progres pemakaian, serta aksi mengubah batas. Ikuti desain, navigasi, dan komponen aplikasi yang sudah ada. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'PRD menyebut "anggaran"',
	},
];

function setScrollableMetrics(viewport: HTMLElement, scrollLeft: number) {
	Object.defineProperty(viewport, "scrollWidth", {
		value: 900,
		configurable: true,
	});
	Object.defineProperty(viewport, "clientWidth", {
		value: 240,
		configurable: true,
	});
	Object.defineProperty(viewport, "scrollLeft", {
		value: scrollLeft,
		configurable: true,
	});
}

afterEach(() => cleanup());

describe("StudioComposer next-screen suggestions", () => {
	it("renders the suggestions as one horizontal row of compact buttons", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const viewport = screen.getByRole("region", {
			name: "Saran layar berikutnya",
		});

		expect(screen.getByTestId("studio-suggestion-row")).toBeDefined();
		expect(viewport.querySelectorAll("li")).toHaveLength(2);
		expect(
			screen.getByRole("button", { name: /Buat Catat Transaksi/ }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: /Buat Anggaran/ })).toBeDefined();
	});

	it("fills the composer with the full prompt without submitting it", () => {
		const onSubmit = vi.fn();
		render(<StudioComposer onSubmit={onSubmit} suggestions={SUGGESTIONS} />);

		fireEvent.click(screen.getByRole("button", { name: /Buat Anggaran/ }));

		const input = screen.getByRole("textbox");
		expect(input).toHaveProperty("value", SUGGESTIONS[1]?.prompt);
		expect(onSubmit).not.toHaveBeenCalled();
		// The prompt is ready to submit but the user still decides.
		expect(
			screen
				.getByRole("button", { name: /Kirim prompt/i })
				.hasAttribute("disabled"),
		).toBe(false);
	});

	it("keeps the whole prompt reachable for pointer and screen-reader users", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const bubble = screen.getByRole("button", { name: /Buat Anggaran/ });

		expect(bubble.getAttribute("title")).toBe(SUGGESTIONS[1]?.prompt);
		expect(bubble.textContent).toContain(SUGGESTIONS[1]?.prompt);
		// The visible label is the truncated text; the full prompt is not.
		expect(bubble.textContent?.includes("Jangan mengubah halaman lain.")).toBe(
			true,
		);
	});

	it("disables the bubbles while a request is in flight", () => {
		render(
			<StudioComposer onSubmit={vi.fn()} loading suggestions={SUGGESTIONS} />,
		);

		expect(
			screen
				.getByRole("button", { name: /Buat Anggaran/ })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	it("moves focus between bubbles with the arrow keys", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const first = screen.getByRole("button", { name: /Buat Catat Transaksi/ });
		const second = screen.getByRole("button", { name: /Buat Anggaran/ });

		first.focus();
		fireEvent.keyDown(first, { key: "ArrowRight" });
		expect(document.activeElement).toBe(second);
		fireEvent.keyDown(second, { key: "ArrowRight" });
		expect(document.activeElement).toBe(first);
	});

	it("shows the scroll controls only when the row overflows", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const viewport = screen.getByRole("region", {
			name: "Saran layar berikutnya",
		});

		expect(
			screen.queryByRole("button", { name: "Geser saran ke kiri" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Geser saran ke kanan" }),
		).toBeNull();

		setScrollableMetrics(viewport, 120);
		fireEvent.scroll(viewport);
		expect(
			screen
				.getByRole("button", { name: "Geser saran ke kiri" })
				.hasAttribute("disabled"),
		).toBe(false);
		expect(
			screen
				.getByRole("button", { name: "Geser saran ke kanan" })
				.hasAttribute("disabled"),
		).toBe(false);

		// Back at the start the left control has nothing to reveal.
		setScrollableMetrics(viewport, 0);
		fireEvent.scroll(viewport);
		expect(
			screen
				.getByRole("button", { name: "Geser saran ke kiri" })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	it("renders no suggestion row when the project has nothing to propose", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={[]} />);
		expect(screen.queryByTestId("studio-suggestion-row")).toBeNull();
	});
});
