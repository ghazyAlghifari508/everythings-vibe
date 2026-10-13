// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScrapeFormNotice } from "./scrape-form-notice";

afterEach(() => {
	cleanup();
});

describe("ScrapeFormNotice", () => {
	it("informs about scraping limits without blocking the form", () => {
		render(<ScrapeFormNotice />);
		expect(
			screen.getByText("Tidak semua website dapat di-scrape"),
		).toBeDefined();
		expect(
			screen.getByText(/membatasi akses otomatis atau memerlukan login/),
		).toBeDefined();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});
});
