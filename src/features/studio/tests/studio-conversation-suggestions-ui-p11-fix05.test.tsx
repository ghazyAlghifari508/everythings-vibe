// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConversationSuggestions } from "../components/workspace/studio-conversation-suggestions";
import type { StudioScreenSuggestion } from "../services/studio-screen-suggestions";

const SUGGESTIONS: readonly StudioScreenSuggestion[] = [
	{
		id: "add-state:detail-paket",
		title: "Simulasikan paket wisata yang kehabisan kuota",
		cardCopy: "Simulasikan paket wisata yang kehabisan kuota",
		description: "Jadwal penuh dengan alternatif tanggal.",
		prompt:
			"Pada layar Detail Paket untuk Jelajahin. Tampilkan state kuota habis pada nomor jadwal penuh: nonaktifkan pemesanan, jelaskan sisa kuota, dan tampilkan alternatif jadwal yang masih tersedia. Pertahankan navigasi yang ada. Jangan mengubah halaman lain.",
		intent: "add_state",
		reason: "Konteks project menyebut kebutuhan travel-quota-state",
		targetFrameName: "Detail Paket",
	},
	{
		id: "add-screen:riwayat-perjalanan",
		title: "Rancang riwayat perjalanan dengan filter status",
		cardCopy: "Rancang riwayat perjalanan dengan filter status",
		description: "Pesanan, pembayaran, dan e-tiket.",
		prompt:
			"Buat satu halaman Riwayat Perjalanan untuk Jelajahin. Tampilkan pesanan sebelumnya dan perjalanan mendatang dengan status pembayaran serta akses e-tiket. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'Alur aplikasi travel menyebut "wisata"',
	},
];

afterEach(() => cleanup());

describe("StudioConversationSuggestions", () => {
	it("renders a vertical full-width list with no carousel controls or horizontal scroll", () => {
		render(
			<StudioConversationSuggestions
				suggestions={SUGGESTIONS}
				onSelect={vi.fn()}
			/>,
		);
		const region = screen.getByRole("region", {
			name: "Saran langkah berikutnya",
		});
		const list = screen.getByRole("list");
		expect(list.className).toContain("flex-col");
		expect(region.className).not.toMatch(/sticky|fixed|absolute/);
		expect(list.className).not.toContain("overflow-x");
		for (const button of screen.getAllByRole("button")) {
			expect(button.className).toContain("w-full");
			expect(screen.queryByRole("button", { name: /Geser saran/ })).toBeNull();
		}
		expect(screen.queryByRole("heading")).toBeNull();
	});

	it("uses one curved-arrow icon per row and no intent-category icons", () => {
		render(
			<StudioConversationSuggestions
				suggestions={SUGGESTIONS}
				onSelect={vi.fn()}
			/>,
		);
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(SUGGESTIONS.length);
		for (const button of buttons) {
			expect(
				button.querySelectorAll('[data-suggestion-icon="curved-arrow"]'),
			).toHaveLength(1);
			expect(button.querySelectorAll("svg")).toHaveLength(1);
			expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
				"true",
			);
		}
	});

	it("wraps long prompts naturally instead of clipping them", () => {
		render(
			<StudioConversationSuggestions
				suggestions={SUGGESTIONS}
				onSelect={vi.fn()}
			/>,
		);
		const first = screen.getAllByRole("button")[0];
		const copy = first?.querySelector("span");
		expect(copy?.className).not.toMatch(
			/truncate|line-clamp|whitespace-nowrap/,
		);
		expect(copy?.textContent).toBe(SUGGESTIONS[0]?.cardCopy);
	});

	it("hands the whole suggestion to onSelect without submitting anything", () => {
		const onSelect = vi.fn();
		render(
			<StudioConversationSuggestions
				suggestions={SUGGESTIONS}
				onSelect={onSelect}
			/>,
		);
		fireEvent.click(screen.getAllByRole("button")[1] as HTMLButtonElement);
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(SUGGESTIONS[1]);
	});

	it("moves focus between rows with arrow keys and keeps native tab order", () => {
		render(
			<StudioConversationSuggestions
				suggestions={SUGGESTIONS}
				onSelect={vi.fn()}
			/>,
		);
		const [first, second] = screen.getAllByRole(
			"button",
		) as HTMLButtonElement[];
		first.focus();
		fireEvent.keyDown(first, { key: "ArrowDown" });
		expect(document.activeElement).toBe(second);
		fireEvent.keyDown(second, { key: "ArrowUp" });
		expect(document.activeElement).toBe(first);
		expect(first.getAttribute("tabindex")).toBeNull();
		expect(second.getAttribute("tabindex")).toBeNull();
	});

	it("disables the rows while a request is in flight", () => {
		render(
			<StudioConversationSuggestions
				suggestions={SUGGESTIONS}
				onSelect={vi.fn()}
				disabled
			/>,
		);
		for (const button of screen.getAllByRole("button"))
			expect(button.hasAttribute("disabled")).toBe(true);
	});

	it("renders nothing when no suggestion belongs to the result", () => {
		render(
			<StudioConversationSuggestions suggestions={[]} onSelect={vi.fn()} />,
		);
		expect(screen.queryByRole("list")).toBeNull();
	});
});
