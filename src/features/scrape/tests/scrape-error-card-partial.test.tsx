// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		search,
		children,
		...rest
	}: {
		to: string;
		search?: Record<string, unknown>;
		children?: ReactNode;
	}) =>
		createElement(
			"a",
			{
				href: search
					? `${to}?${new URLSearchParams(search as Record<string, string>).toString()}`
					: to,
				...rest,
			},
			children,
		),
}));

import { ScrapeErrorCard } from "../components/scrape-error-card";

afterEach(() => {
	cleanup();
});

describe("partial result treatment", () => {
	it("keeps saved results visible with a real counts summary", () => {
		render(
			<ScrapeErrorCard
				title="Resource halaman gagal diambil"
				guidance="Sebagian resource gagal."
				retryable
				onRetry={vi.fn()}
				partial={{
					title: "Sebagian proses tidak selesai",
					availableLabel: "24 gambar tersedia",
					failedLabel: "6 resource gagal diambil",
					actionLabel: "Lihat hasil tersedia",
				}}
			/>,
		);
		expect(screen.getByText("Sebagian proses tidak selesai")).toBeDefined();
		expect(screen.getByText("24 gambar tersedia")).toBeDefined();
		expect(screen.getByText("6 resource gagal diambil")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Lihat hasil tersedia" }),
		).toBeDefined();
	});

	it("omits the partial block when nothing was saved", () => {
		render(
			<ScrapeErrorCard
				title="Halaman belum berhasil diambil"
				guidance="Tidak ada hasil."
				retryable
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.queryByText(/sebagian proses tidak selesai/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /lihat hasil/i })).toBeNull();
	});

	it("scrolls to the saved results without navigating away", () => {
		const scrollIntoView = vi.fn();
		const target = document.createElement("div");
		target.id = "scrape-results";
		target.scrollIntoView = scrollIntoView;
		document.body.appendChild(target);
		render(
			<ScrapeErrorCard
				title="Resource halaman gagal diambil"
				guidance="Sebagian resource gagal."
				retryable
				onRetry={vi.fn()}
				partial={{
					title: "Sebagian proses tidak selesai",
					availableLabel: "2 gambar tersedia",
					failedLabel: null,
					actionLabel: "Lihat hasil tersedia",
				}}
			/>,
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Lihat hasil tersedia" }),
		);
		expect(scrollIntoView).toHaveBeenCalled();
		target.remove();
	});
});

describe("recovery actions", () => {
	it("opens the form for the failing mode instead of the default one", () => {
		render(
			<ScrapeErrorCard
				title="Resource halaman gagal diambil"
				guidance="Coba lagi."
				retryable
				onRetry={vi.fn()}
				mode="images"
			/>,
		);
		expect(
			screen
				.getByRole("link", { name: "Gunakan URL lain" })
				.getAttribute("href"),
		).toBe("/scrape?mode=images");
	});

	it("keeps the workspace link when the mode is unknown", () => {
		render(
			<ScrapeErrorCard
				title="Pemrosesan berhenti"
				guidance="Coba lagi."
				retryable
				onRetry={vi.fn()}
			/>,
		);
		expect(
			screen
				.getByRole("link", { name: "Gunakan URL lain" })
				.getAttribute("href"),
		).toBe("/scrape");
	});

	it("hides retry while a real cooldown is running", () => {
		const retry = vi.fn();
		render(
			<ScrapeErrorCard
				title="Website membatasi permintaan"
				guidance="Tunggu."
				retryable
				retryAfterExpiresAt={new Date(Date.now() + 60_000).toISOString()}
				retryAfterRemaining={60}
				onRetry={retry}
			/>,
		);
		const button = screen.getByRole("button", {
			name: "Coba lagi — belum tersedia",
		});
		expect(button.hasAttribute("disabled")).toBe(true);
		fireEvent.click(button);
		expect(retry).not.toHaveBeenCalled();
	});
});
