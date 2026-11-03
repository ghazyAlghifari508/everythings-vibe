// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { FeedbackForm } from "../components/settings/feedback-form";

describe("FeedbackForm", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		useUIStore.setState({ toastMessage: null, toastType: null, toastId: 0 });
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
		useUIStore.setState({ toastMessage: null, toastType: null, toastId: 0 });
	});

	it("shows approved success toast copy for general feedback and resets form", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true }),
		});
		globalThis.fetch = fetchMock;

		render(<FeedbackForm />);

		const textarea = screen.getByLabelText(/pesan feedback/i);
		fireEvent.change(textarea, {
			target: { value: "Aplikasi sangat membantu dan mudah digunakan." },
		});

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Masukan berhasil dikirim. Terima kasih sudah membantu kami meningkatkan everythings-vibe.",
			);
			expect(useUIStore.getState().toastType).toBe("success");
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/feedback",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					message: "Aplikasi sangat membantu dan mudah digunakan.",
					type: "general",
				}),
			}),
		);

		// Form reset only on success
		expect((textarea as HTMLTextAreaElement).value).toBe("");
	});

	it("shows approved success toast copy for bug report and resets form", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true }),
		});
		globalThis.fetch = fetchMock;

		render(<FeedbackForm />);

		const bugButton = screen.getByRole("button", { name: /bug report/i });
		fireEvent.click(bugButton);

		const textarea = screen.getByLabelText(/pesan feedback/i);
		fireEvent.change(textarea, {
			target: { value: "Export JSON gagal dengan status 500." },
		});

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Laporan bug berhasil dikirim. Laporanmu sudah tercatat dan dapat ditinjau oleh tim.",
			);
			expect(useUIStore.getState().toastType).toBe("success");
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/feedback",
			expect.objectContaining({
				body: JSON.stringify({
					message: "Export JSON gagal dengan status 500.",
					type: "bug",
				}),
			}),
		);
		expect((textarea as HTMLTextAreaElement).value).toBe("");
	});

	it("shows approved success toast copy for feature request and resets form", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true }),
		});
		globalThis.fetch = fetchMock;

		render(<FeedbackForm />);

		const featureButton = screen.getByRole("button", { name: /fitur baru/i });
		fireEvent.click(featureButton);

		const textarea = screen.getByLabelText(/pesan feedback/i);
		fireEvent.change(textarea, {
			target: { value: "Tolong tambahkan integrasi webhook kustom." },
		});

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Usulan fitur berhasil dikirim. Masukanmu sudah tercatat untuk dipertimbangkan.",
			);
			expect(useUIStore.getState().toastType).toBe("success");
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/feedback",
			expect.objectContaining({
				body: JSON.stringify({
					message: "Tolong tambahkan integrasi webhook kustom.",
					type: "feature",
				}),
			}),
		);
		expect((textarea as HTMLTextAreaElement).value).toBe("");
	});

	it("shows default error toast on failed submission without specific message and does not reset form", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => {
				throw new Error("Internal Server Error");
			},
		});
		globalThis.fetch = fetchMock;

		render(<FeedbackForm />);

		const textarea = screen.getByLabelText(/pesan feedback/i);
		const initialMessage = "Laporan masalah pada server.";
		fireEvent.change(textarea, { target: { value: initialMessage } });

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Pesan belum berhasil dikirim. Periksa koneksi lalu coba lagi.",
			);
			expect(useUIStore.getState().toastType).toBe("error");
		});

		// Form does NOT reset on failure
		expect((textarea as HTMLTextAreaElement).value).toBe(initialMessage);
	});

	it("shows default error toast on network error and does not reset form", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValue(new TypeError("Failed to fetch"));
		globalThis.fetch = fetchMock;

		render(<FeedbackForm />);

		const textarea = screen.getByLabelText(/pesan feedback/i);
		const initialMessage = "Pesan saat koneksi terputus.";
		fireEvent.change(textarea, { target: { value: initialMessage } });

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Pesan belum berhasil dikirim. Periksa koneksi lalu coba lagi.",
			);
			expect(useUIStore.getState().toastType).toBe("error");
		});

		expect((textarea as HTMLTextAreaElement).value).toBe(initialMessage);
	});

	it("shows specific server validation error toast and does not reset form", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: "Pesan feedback maksimal 2000 karakter." }),
		});
		globalThis.fetch = fetchMock;
		render(<FeedbackForm />);
		const textarea = screen.getByLabelText(/pesan feedback/i);
		const longMessage = "Pesan terlalu panjang melebihi batas yang ditentukan.";
		fireEvent.change(textarea, { target: { value: longMessage } });

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Pesan feedback maksimal 2000 karakter.",
			);
			expect(useUIStore.getState().toastType).toBe("error");
		});

		expect((textarea as HTMLTextAreaElement).value).toBe(longMessage);
	});

	it("prevents duplicate submissions and duplicate success toasts while in flight", async () => {
		let resolveFetch!: (value: {
			ok: boolean;
			json: () => Promise<{ success: boolean }>;
		}) => void;
		const pendingPromise = new Promise<{
			ok: boolean;
			json: () => Promise<{ success: boolean }>;
		}>((resolve) => {
			resolveFetch = resolve;
		});
		const fetchMock = vi.fn().mockReturnValue(pendingPromise);
		globalThis.fetch = fetchMock;

		render(<FeedbackForm />);

		const textarea = screen.getByLabelText(/pesan feedback/i);
		fireEvent.change(textarea, { target: { value: "Uji duplicate submit" } });

		const submitButton = screen.getByRole("button", {
			name: /kirim feedback/i,
		});
		// First click
		fireEvent.click(submitButton);
		// Second click while in flight
		fireEvent.click(submitButton);

		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Resolve first fetch
		resolveFetch({
			ok: true,
			json: async () => ({ success: true }),
		});

		await waitFor(() => {
			expect(useUIStore.getState().toastMessage).toBe(
				"Masukan berhasil dikirim. Terima kasih sudah membantu kami meningkatkan everythings-vibe.",
			);
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
