// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { Toast } from "./toast";

describe("Toast notification system", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		useUIStore.setState({ toastMessage: null, toastType: null, toastId: 0 });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("renders nothing when there is no active toast message", () => {
		const { container } = render(<Toast />);
		expect(container.firstChild).toBeNull();
	});

	it("renders success toast with correct theme tokens, icon, and text", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Project berhasil dihapus", "success");
		});

		const message = screen.getByText("Project berhasil dihapus");
		expect(message).toBeDefined();

		const card = message.closest("div[role='status']");
		expect(card).not.toBeNull();
		expect(card?.className).toContain("bg-obsidian");
		expect(card?.className).toContain("border-graphite");
		expect(card?.className).toContain("text-snow");

		const icon = card?.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon?.getAttribute("aria-hidden")).toBe("true");
		expect(icon?.getAttribute("class")).toContain("text-emerald");
	});

	it("renders error toast with correct theme tokens, crimson icon, and multi-line text", () => {
		render(<Toast />);
		act(() => {
			useUIStore
				.getState()
				.showToast("Project tidak dapat dihapus\nCoba lagi.", "error");
		});

		const errorCard = screen.getByRole("alert");
		expect(errorCard).toBeDefined();
		expect(errorCard.className).toContain("bg-obsidian");
		expect(errorCard.className).toContain("border-graphite");
		expect(errorCard.className).toContain("text-snow");
		expect(errorCard.textContent).toContain("Project tidak dapat dihapus");
		expect(errorCard.textContent).toContain("Coba lagi.");

		const icon = errorCard.querySelector("svg");
		expect(icon?.getAttribute("class")).toContain("text-crimson");
	});

	it("accounts for floating widget safe area and responsive layout", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Notifikasi aman", "info");
		});

		const region = screen.getByRole("region", { name: "Notifikasi sistem" });
		expect(region).toBeDefined();
		expect(region.className).toContain("fixed");
		expect(region.className).toContain("z-[60]");
		expect(region.className).toContain("pointer-events-none");
		expect(region.className).toContain("left-4");
		expect(region.className).toContain("right-4");
		expect(region.className).toContain("sm:left-auto");
		expect(region.className).toContain("sm:right-6");

		// Uses systematic bottom offset with safe area insets
		expect(region.style.bottom).toContain("var(--toast-bottom-offset");
		expect(region.style.bottom).toContain("env(safe-area-inset-bottom");
	});

	it("provides proper ARIA accessibility semantics", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Pembaruan selesai", "success");
		});

		const statusRegion = screen.getByRole("status");
		expect(statusRegion.getAttribute("aria-live")).toBe("polite");
		expect(statusRegion.getAttribute("aria-atomic")).toBe("true");

		act(() => {
			useUIStore.getState().showToast("Gagal menyimpan", "error");
		});

		const alertRegion = screen.getByRole("alert");
		expect(alertRegion.getAttribute("aria-live")).toBe("assertive");
		expect(alertRegion.getAttribute("aria-atomic")).toBe("true");

		const closeBtn = screen.getByRole("button", { name: "Tutup notifikasi" });
		expect(closeBtn).toBeDefined();
	});

	it("supports reduced motion preferences", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Testing motion", "info");
		});

		const card = screen.getByRole("status");
		expect(card.className).toContain("motion-reduce:animate-none");
	});

	it("auto-dismisses after 4000ms", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Pesan sementara", "info");
		});

		expect(screen.queryByText("Pesan sementara")).not.toBeNull();

		act(() => {
			vi.advanceTimersByTime(3999);
		});
		expect(screen.queryByText("Pesan sementara")).not.toBeNull();

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(screen.queryByText("Pesan sementara")).toBeNull();
	});

	it("dismisses immediately when the close button is clicked", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Tutup saya", "info");
		});

		const closeBtn = screen.getByRole("button", { name: "Tutup notifikasi" });
		act(() => {
			fireEvent.click(closeBtn);
		});

		expect(screen.queryByText("Tutup saya")).toBeNull();
	});

	it("prevents duplicate toasts when called repeatedly and resets timer", () => {
		render(<Toast />);
		act(() => {
			useUIStore.getState().showToast("Pesan berulang", "success");
		});

		act(() => {
			vi.advanceTimersByTime(2000);
		});

		// Trigger again at t=2000ms with identical message
		act(() => {
			useUIStore.getState().showToast("Pesan berulang", "success");
		});

		// Exactly one toast element should exist in DOM
		const allToasts = screen.getAllByText("Pesan berulang");
		expect(allToasts.length).toBe(1);

		// At t=4000ms (2000ms after second call), toast should STILL be visible
		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(screen.queryByText("Pesan berulang")).not.toBeNull();

		// At t=6000ms (4000ms after second call), toast dismisses
		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(screen.queryByText("Pesan berulang")).toBeNull();
	});

	it("remains compatible with global toast callers (1 or 2 arguments)", () => {
		render(<Toast />);

		// Single argument defaults to info
		act(() => {
			useUIStore.getState().showToast("Informasi umum");
		});
		expect(useUIStore.getState().toastType).toBe("info");
		expect(screen.getByText("Informasi umum")).toBeDefined();

		// Two arguments
		act(() => {
			useUIStore.getState().showToast("Berhasil", "success");
		});
		expect(useUIStore.getState().toastType).toBe("success");
		expect(screen.getByText("Berhasil")).toBeDefined();
	});
});
