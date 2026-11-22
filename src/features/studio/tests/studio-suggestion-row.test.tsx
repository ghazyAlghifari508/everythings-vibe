// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import type { StudioScreenSuggestion } from "@/features/studio/services/studio-screen-suggestions";

const SUGGESTIONS: StudioScreenSuggestion[] = [
	{
		id: "add-screen:riwayat-perjalanan",
		title: "Buat halaman riwayat perjalanan",
		cardCopy: "Rancang riwayat perjalanan dengan filter status",
		description: "Pesanan, pembayaran, dan e-tiket.",
		prompt:
			"Buat satu halaman Riwayat Perjalanan untuk Jelajahin. Tampilkan daftar pesanan sebelumnya dan perjalanan mendatang, ringkasan paket, tanggal keberangkatan, status pembayaran, serta akses detail pesanan dan e-tiket. Gunakan navigasi, warna, tipografi, header, dan komponen yang konsisten dengan layar project yang sudah ada. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'Alur aplikasi travel menyebut "wisata"',
	},
	{
		id: "add-screen:wishlist-paket-wisata",
		title: "Rancang wishlist paket wisata",
		cardCopy: "Bandingkan paket wisata yang tersimpan",
		description: "Simpan favorit dan bandingkan destinasi.",
		prompt:
			"Buat satu halaman Wishlist Paket Wisata untuk Jelajahin. Tampilkan paket yang disimpan dengan foto, harga, durasi, serta aksi membandingkan dan menghapus dari daftar. Gunakan navigasi, warna, tipografi, header, dan komponen yang konsisten dengan layar project yang sudah ada. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'Alur aplikasi travel menyebut "wisata"',
	},
];

const ACTION: StudioScreenSuggestion = {
	id: "add-state:detail-paket",
	title: "Simulasikan paket wisata yang kehabisan kuota",
	cardCopy: "Simulasikan paket wisata yang kehabisan kuota",
	description: "Jadwal penuh dengan alternatif tanggal.",
	prompt:
		"Pada layar Detail Paket untuk Jelajahin. Tampilkan state kuota habis pada nomor jadwal penuh: nonaktifkan pemesanan, jelaskan sisa kuota, dan tampilkan alternatif jadwal yang masih tersedia. Pertahankan navigasi, warna, tipografi, header, dan komponen yang sudah ada. Jangan mengubah halaman lain.",
	intent: "add_state",
	targetFrameName: "Detail Paket",
	reason: "Konteks project menyebut kebutuhan travel-quota-state",
};

const firstCard = () =>
	screen.getByRole("button", {
		name: "Rancang riwayat perjalanan dengan filter status",
	});
const secondCard = () =>
	screen.getByRole("button", {
		name: "Bandingkan paket wisata yang tersimpan",
	});

afterEach(() => cleanup());

describe("StudioComposer action cards", () => {
	it("renders a sentence card with its benefit for every suggestion", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const region = screen.getByRole("region", {
			name: "Saran aksi berikutnya",
		});

		expect(region.querySelectorAll("li")).toHaveLength(2);
		expect(region.textContent).toContain(
			"Rancang riwayat perjalanan dengan filter status",
		);
		expect(region.textContent).toContain("Pesanan, pembayaran, dan e-tiket.");
		expect(region.textContent).toContain(
			"Bandingkan paket wisata yang tersimpan",
		);
		expect(region.textContent).toContain(
			"Simpan favorit dan bandingkan destinasi.",
		);
	});

	it("fills the composer with the full prompt without submitting it", () => {
		const onSubmit = vi.fn().mockResolvedValue({ accepted: true });
		render(<StudioComposer onSubmit={onSubmit} suggestions={SUGGESTIONS} />);

		fireEvent.click(secondCard());

		const input = screen.getByRole("textbox");
		expect(input).toHaveProperty("value", SUGGESTIONS[1]?.prompt);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(
			screen
				.getByRole("button", { name: /Kirim prompt/i })
				.hasAttribute("disabled"),
		).toBe(false);
	});

	it("lets the user rewrite the inserted prompt before submitting", async () => {
		const onSubmit = vi.fn().mockResolvedValue({ accepted: true });
		render(<StudioComposer onSubmit={onSubmit} suggestions={SUGGESTIONS} />);
		const edited = "Buat halaman Riwayat Perjalanan dengan filter tahun.";

		fireEvent.click(firstCard());
		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: edited } });
		expect(input).toHaveProperty("value", edited);

		fireEvent.keyDown(input, { key: "Enter" });
		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(edited));
	});

	it("keeps the whole prompt reachable for pointer and screen-reader users", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const card = secondCard();

		expect(card.getAttribute("title")).toBe(SUGGESTIONS[1]?.prompt);
		expect(card.textContent).toContain(SUGGESTIONS[1]?.prompt);
		expect(card.textContent?.includes("Jangan mengubah halaman lain.")).toBe(
			true,
		);
	});

	it("disables the cards while a request is in flight", () => {
		render(
			<StudioComposer onSubmit={vi.fn()} loading suggestions={SUGGESTIONS} />,
		);

		expect(secondCard().hasAttribute("disabled")).toBe(true);
	});

	it("moves focus between cards with the arrow keys", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);

		firstCard().focus();
		fireEvent.keyDown(firstCard(), { key: "ArrowDown" });
		expect(document.activeElement).toBe(secondCard());
		fireEvent.keyDown(secondCard(), { key: "ArrowDown" });
		expect(document.activeElement).toBe(firstCard());
		fireEvent.keyDown(firstCard(), { key: "ArrowUp" });
		expect(document.activeElement).toBe(secondCard());
	});

	it("renders no suggestion row when the project has nothing to propose", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={[]} />);
		expect(screen.queryByTestId("studio-suggestion-row")).toBeNull();
		expect(
			screen.queryByRole("region", { name: "Saran aksi berikutnya" }),
		).toBeNull();
	});

	it("lays the cards out horizontally without shortcut pills", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const row = screen.getByTestId("studio-suggestion-row");

		expect(row.className).toContain("items-stretch");
		const list = row.querySelector("ul");
		expect(list?.className).toContain("flex");
		for (const card of [firstCard(), secondCard()]) {
			expect(card.className).toContain("flex-col");
			expect(card.textContent?.length ?? 0).toBeGreaterThan(40);
			expect(card.querySelector("svg")).not.toBeNull();
		}
		expect(screen.queryByText("Riwayat", { exact: true })).toBeNull();
	});

	it("moves focus between cards using horizontal ArrowRight and ArrowLeft", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);

		firstCard().focus();
		fireEvent.keyDown(firstCard(), { key: "ArrowRight" });
		expect(document.activeElement).toBe(secondCard());
		fireEvent.keyDown(secondCard(), { key: "ArrowRight" });
		expect(document.activeElement).toBe(firstCard());
		fireEvent.keyDown(firstCard(), { key: "ArrowLeft" });
		expect(document.activeElement).toBe(secondCard());
	});

	it("shows scroll buttons when horizontal content overflows the viewport", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const region = screen.getByRole("region", {
			name: "Saran aksi berikutnya",
		});

		Object.defineProperty(region, "scrollWidth", {
			value: 600,
			configurable: true,
		});
		Object.defineProperty(region, "clientWidth", {
			value: 300,
			configurable: true,
		});
		Object.defineProperty(region, "scrollLeft", {
			value: 50,
			configurable: true,
		});

		fireEvent.scroll(region);

		expect(
			screen.getByRole("button", { name: "Geser saran ke kiri" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Geser saran ke kanan" }),
		).toBeDefined();
	});

	it("attaches only the card's exact target frame without submitting", () => {
		const onSubmit = vi.fn().mockResolvedValue({ accepted: true });
		const onSelectTargetFrame = vi.fn();
		render(
			<StudioComposer
				onSubmit={onSubmit}
				suggestions={[ACTION]}
				onSelectTargetFrame={onSelectTargetFrame}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: "Simulasikan paket wisata yang kehabisan kuota",
			}),
		);

		expect(onSelectTargetFrame).toHaveBeenCalledExactlyOnceWith("Detail Paket");
		expect(screen.getByRole("textbox")).toHaveProperty("value", ACTION.prompt);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("clears a stale target when the card proposes a new screen", () => {
		const onSelectTargetFrame = vi.fn();
		render(
			<StudioComposer
				onSubmit={vi.fn()}
				suggestions={SUGGESTIONS}
				onSelectTargetFrame={onSelectTargetFrame}
			/>,
		);

		fireEvent.click(firstCard());

		expect(onSelectTargetFrame).toHaveBeenCalledExactlyOnceWith(null);
	});
});
