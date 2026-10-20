// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BentoHub } from "./bento-hub";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

afterEach(cleanup);

const DESTINATIONS = ["/plan", "/design", "/scrape", "/templates", "/bantuan"];

describe("home product destinations", () => {
	it.each([
		["VibePlan", "/plan"],
		["VibeDesign Studio", "/design"],
		["VibeScrape", "/scrape"],
		["VibeTemplate", "/templates"],
		["VibeBantuan", "/bantuan"],
	])("opens %s directly at %s", (product, destination) => {
		render(<BentoHub />);
		expect(
			screen
				.getByRole("link", { name: new RegExp(product) })
				.getAttribute("href"),
		).toBe(destination);
	});
});

describe("BentoHub", () => {
	it("renders a heading that states the hub purpose", () => {
		render(<BentoHub />);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
			"Mau ngapain hari ini?",
		);
		expect(
			screen.getByText(
				/Pilih workspace untuk mulai menyusun requirements produk/i,
			),
		).toBeDefined();
	});

	// A div with an onClick has no implicit link role, so this count catches that regression.
	it("renders exactly one real link per product card", () => {
		render(<BentoHub />);

		expect(screen.getAllByRole("link")).toHaveLength(DESTINATIONS.length);
	});

	// Sorting before comparing would let a reordered CARDS array pass, so assert DOM sequence.
	it("orders the cards as plan, Studio, Scrape, Template, Bantuan", () => {
		render(<BentoHub />);

		expect(
			screen.getAllByRole("link").map((link) => link.getAttribute("href")),
		).toEqual(DESTINATIONS);
	});
});

// A card must not advertise a capability its own destination page denies.
describe("BentoHub copy vs destination reality", () => {
	it("does not advertise any product as planned or inactive", () => {
		render(<BentoHub />);

		expect(screen.queryByText(/belum aktif/i)).toBeNull();
		expect(screen.queryByText(/direncanakan/i)).toBeNull();
	});

	it("keeps the extraction promise on the VibeScrape card only", () => {
		render(<BentoHub />);

		expect(
			within(screen.getByRole("link", { name: /VibeScrape/ })).getByText(
				/ekstrak website/i,
			),
		).toBeDefined();
		expect(
			within(
				screen.getByRole("link", { name: /VibeDesign Studio/ }),
			).queryByText(/ekstrak website/i),
		).toBeNull();
	});
});

describe("design landing destinations", () => {
	it("points VibeDesign directly to /design and VibeScrape directly to /scrape", () => {
		render(<BentoHub />);

		expect(
			screen
				.getByRole("link", { name: /VibeDesign Studio/ })
				.getAttribute("href"),
		).toBe("/design");
		expect(
			screen.getByRole("link", { name: /VibeScrape/ }).getAttribute("href"),
		).toBe("/scrape");
	});
});
