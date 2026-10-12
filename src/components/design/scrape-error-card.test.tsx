// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) =>
		createElement("a", { href: to, ...rest }, children),
}));

import { ScrapeErrorCard } from "./scrape-error-card";

afterEach(() => {
	cleanup();
});

describe("ScrapeErrorCard", () => {
	it("announces one failure reason with a functional retry", () => {
		const retry = vi.fn();
		render(
			<ScrapeErrorCard
				title="Website membatasi akses"
				guidance="Website tujuan membatasi permintaan otomatis."
				retryable
				technicalDetail="Detail teknis: HTTP 429"
				onRetry={retry}
			/>,
		);
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(screen.getAllByRole("button")).toHaveLength(1);
		fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("hides retry for failures a retry cannot fix", () => {
		render(
			<ScrapeErrorCard
				title="URL tidak valid"
				guidance="Masukkan URL website publik yang benar."
				retryable={false}
				technicalDetail="Detail teknis: URL tidak valid"
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.getByRole("link", { name: "URL lain" })).toBeDefined();
	});

	it("points the secondary action at the scrape workspace", () => {
		render(
			<ScrapeErrorCard
				title="Pemrosesan berhenti"
				guidance="Coba lagi."
				retryable
				onRetry={vi.fn()}
			/>,
		);
		expect(
			screen.getByRole("link", { name: "URL lain" }).getAttribute("href"),
		).toBe("/design/scrap");
	});

	it("shows the real wait only when the backend supplied it", () => {
		const { rerender } = render(
			<ScrapeErrorCard
				title="Website membatasi akses"
				guidance="Tunggu sebelum mencoba lagi."
				retryable
				retryHint="Tunggu sekitar 60 detik sebelum mencoba lagi."
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.getByText(/60 detik/)).toBeDefined();

		rerender(
			<ScrapeErrorCard
				title="Website membatasi akses"
				guidance="Tunggu sebelum mencoba lagi."
				retryable
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.queryByText(/\d+\s*detik/)).toBeNull();
	});
});
