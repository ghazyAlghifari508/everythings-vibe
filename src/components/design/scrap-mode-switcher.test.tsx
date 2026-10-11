// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapModeSwitcher } from "./scrap-mode-switcher";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	navigate.mockReset();
});

describe("extraction workspace", () => {
	it("selects all four modes with keyboard navigation", () => {
		render(<ScrapModeSwitcher />);
		const design = screen.getByRole("tab", { name: "Generate DESIGN.md" });
		expect(design.getAttribute("aria-selected")).toBe("true");
		fireEvent.keyDown(design, { key: "ArrowRight" });
		expect(
			screen
				.getByRole("tab", { name: "Scrape HTML" })
				.getAttribute("aria-selected"),
		).toBe("true");
		fireEvent.keyDown(screen.getByRole("tab", { name: "Scrape HTML" }), {
			key: "End",
		});
		expect(
			screen
				.getByRole("tab", { name: "Scrape Images" })
				.getAttribute("aria-selected"),
		).toBe("true");
		fireEvent.keyDown(screen.getByRole("tab", { name: "Scrape Images" }), {
			key: "Home",
		});
		expect(
			screen
				.getByRole("tab", { name: "Crawl Website" })
				.getAttribute("aria-selected"),
		).toBe("true");
	});
	it("preserves shared URL and independent mode settings and resets only active settings", () => {
		render(<ScrapModeSwitcher />);
		fireEvent.change(screen.getByLabelText("URL website"), {
			target: { value: "http://sample.example/path?q=1" },
		});
		fireEvent.click(screen.getByRole("tab", { name: "Crawl Website" }));
		fireEvent.change(screen.getByLabelText(/Max Pages/), {
			target: { value: "3" },
		});
		fireEvent.click(screen.getByRole("tab", { name: "Scrape HTML" }));
		fireEvent.change(screen.getByLabelText(/Wait for/), {
			target: { value: "200" },
		});
		fireEvent.click(screen.getByText("Reset parameters"));
		expect(screen.getByLabelText(/Wait for/).getAttribute("value")).toBe("0");
		fireEvent.click(screen.getByRole("tab", { name: "Crawl Website" }));
		expect(screen.getByLabelText(/Max Pages/).getAttribute("value")).toBe("3");
		expect(screen.getByLabelText("URL website").getAttribute("value")).toBe(
			"sample.example/path?q=1",
		);
	});
	it.each([
		"design",
		"html",
		"crawl",
		"images",
	] as const)("submits normalized typed %s request once", async (mode) => {
		const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({
			ok: true,
			json: async () => ({ scrapeId: "result-1" }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		render(<ScrapModeSwitcher />);
		const labels = {
			design: "Generate DESIGN.md",
			html: "Scrape HTML",
			crawl: "Crawl Website",
			images: "Scrape Images",
		};
		fireEvent.click(screen.getByRole("tab", { name: labels[mode] }));
		fireEvent.change(screen.getByLabelText("URL website"), {
			target: { value: "https://sample.example/path?q=1" },
		});
		const submit = screen.getByRole("button", {
			name: `Jalankan ${labels[mode]}`,
		});
		fireEvent.click(submit);
		fireEvent.click(submit);
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledWith({
				to: "/design/scrap/$id",
				params: { id: "result-1" },
				search: { from: "/design/scrap" },
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const call = fetchMock.mock.calls[0];
		expect(JSON.parse(String(call[1].body))).toMatchObject({
			mode,
			url: "https://sample.example/path?q=1",
		});
	});
});
