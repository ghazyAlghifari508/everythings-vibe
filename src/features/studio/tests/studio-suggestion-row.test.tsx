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
		description: "Pesanan, pembayaran, dan e-tiket.",
		prompt:
			"Buat satu halaman Riwayat Perjalanan untuk Jelajahin. Tampilkan daftar pesanan sebelumnya dan perjalanan mendatang, ringkasan paket, tanggal keberangkatan, status pembayaran, serta akses detail pesanan dan e-tiket. Gunakan navigasi, warna, tipografi, header, dan komponen yang konsisten dengan layar project yang sudah ada. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'Alur aplikasi travel menyebut "wisata"',
	},
	{
		id: "add-screen:wishlist-paket-wisata",
		title: "Rancang wishlist paket wisata",
		description: "Simpan favorit dan bandingkan destinasi.",
		prompt:
			"Buat satu halaman Wishlist Paket Wisata untuk Jelajahin. Tampilkan paket yang disimpan dengan foto, harga, durasi, serta aksi membandingkan dan menghapus dari daftar. Gunakan navigasi, warna, tipografi, header, dan komponen yang konsisten dengan layar project yang sudah ada. Jangan mengubah halaman lain.",
		intent: "add_screen",
		reason: 'Alur aplikasi travel menyebut "wisata"',
	},
];

afterEach(() => cleanup());

describe("StudioComposer next-screen suggestions", () => {
	it("renders one card per suggestion with its title and description", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const region = screen.getByRole("region", {
			name: "Saran layar berikutnya",
		});

		expect(region.querySelectorAll("li")).toHaveLength(2);
		expect(
			screen.getByRole("button", { name: /Buat halaman riwayat perjalanan/ }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Rancang wishlist paket wisata/ }),
		).toBeDefined();
		expect(region.textContent).toContain("Pesanan, pembayaran, dan e-tiket.");
		expect(region.textContent).toContain(
			"Simpan favorit dan bandingkan destinasi.",
		);
	});

	it("fills the composer with the full prompt without submitting it", () => {
		const onSubmit = vi.fn().mockResolvedValue({ accepted: true });
		render(<StudioComposer onSubmit={onSubmit} suggestions={SUGGESTIONS} />);

		fireEvent.click(
			screen.getByRole("button", { name: /Rancang wishlist paket wisata/ }),
		);

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

	it("lets the user rewrite the inserted prompt before submitting", async () => {
		const onSubmit = vi.fn().mockResolvedValue({ accepted: true });
		render(<StudioComposer onSubmit={onSubmit} suggestions={SUGGESTIONS} />);
		const edited = "Buat halaman Riwayat Perjalanan dengan filter tahun.";

		fireEvent.click(
			screen.getByRole("button", { name: /Buat halaman riwayat perjalanan/ }),
		);
		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: edited } });
		expect(input).toHaveProperty("value", edited);

		fireEvent.keyDown(input, { key: "Enter" });
		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(edited));
	});

	it("keeps the whole prompt reachable for pointer and screen-reader users", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const card = screen.getByRole("button", {
			name: /Rancang wishlist paket wisata/,
		});

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

		expect(
			screen
				.getByRole("button", { name: /Rancang wishlist paket wisata/ })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	it("moves focus between cards with the arrow keys", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={SUGGESTIONS} />);
		const first = screen.getByRole("button", {
			name: /Buat halaman riwayat perjalanan/,
		});
		const second = screen.getByRole("button", {
			name: /Rancang wishlist paket wisata/,
		});

		first.focus();
		fireEvent.keyDown(first, { key: "ArrowDown" });
		expect(document.activeElement).toBe(second);
		fireEvent.keyDown(second, { key: "ArrowDown" });
		expect(document.activeElement).toBe(first);
		fireEvent.keyDown(first, { key: "ArrowUp" });
		expect(document.activeElement).toBe(second);
	});

	it("renders no suggestion row when the project has nothing to propose", () => {
		render(<StudioComposer onSubmit={vi.fn()} suggestions={[]} />);
		expect(screen.queryByTestId("studio-suggestion-row")).toBeNull();
		expect(
			screen.queryByRole("region", { name: "Saran layar berikutnya" }),
		).toBeNull();
	});
});
