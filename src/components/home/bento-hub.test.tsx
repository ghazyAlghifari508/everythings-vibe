// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BentoHub } from "./bento-hub";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

const DESTINATIONS = ["/plan", "/design", "/templates", "/bantuan"];

function hubHrefs(): Array<string | null> {
	return screen
		.getAllByRole("link")
		.map((link) => link.getAttribute("href"))
		.sort();
}

afterEach(() => {
	cleanup();
});

describe("BentoHub", () => {
	it("renders a heading that states the hub purpose", () => {
		render(<BentoHub />);

		const heading = screen.getByRole("heading", { level: 1 });
		expect(heading.textContent).toBe("Mau ngapain hari ini?");
		expect(
			screen.getByText(
				/Pilih workspace untuk mulai menyusun requirements produk/i,
			),
		).toBeDefined();
	});

	it("exposes each card as a link named after its module", () => {
		render(<BentoHub />);

		for (const title of [
			"VibePlan",
			"VibeDesign",
			"VibeTemplate",
			"VibeBantuan",
		]) {
			expect(
				screen.getByRole("link", { name: new RegExp(title) }),
			).toBeDefined();
		}
	});

	it("points every card at a registered destination route", () => {
		render(<BentoHub />);

		expect(hubHrefs()).toEqual([...DESTINATIONS].sort());
	});

	it("keeps the title and its destination in the same card", () => {
		render(<BentoHub />);

		expect(
			screen.getByRole("link", { name: /VibePlan/ }).getAttribute("href"),
		).toBe("/plan");
		expect(
			screen.getByRole("link", { name: /VibeDesign/ }).getAttribute("href"),
		).toBe("/design");
		expect(
			screen.getByRole("link", { name: /VibeTemplate/ }).getAttribute("href"),
		).toBe("/templates");
		expect(
			screen.getByRole("link", { name: /VibeBantuan/ }).getAttribute("href"),
		).toBe("/bantuan");
	});

	// A div with an onClick has no implicit link role, so this count catches that regression.
	it("renders exactly four real links so no card is a click-only div", () => {
		render(<BentoHub />);

		expect(screen.getAllByRole("link")).toHaveLength(4);
	});

	// Sorting before comparing would let a reordered CARDS array pass, so assert DOM sequence.
	it("orders the cards as VibePlan, VibeDesign, VibeTemplate, VibeBantuan", () => {
		render(<BentoHub />);

		expect(
			screen.getAllByRole("link").map((link) => link.getAttribute("href")),
		).toEqual(["/plan", "/design", "/templates", "/bantuan"]);
	});
});

// A card must not advertise a capability its own destination page denies.
describe("BentoHub copy vs destination reality", () => {
	function card(title: string): HTMLElement {
		return screen.getByRole("link", { name: new RegExp(title) });
	}

	it("marks the modules that do not work yet as planned", () => {
		render(<BentoHub />);

		for (const title of ["VibeDesign", "VibeTemplate"]) {
			expect(within(card(title)).getByText("Direncanakan")).toBeDefined();
		}
		// The two modules that do work must not carry the badge.
		for (const title of ["VibePlan", "VibeBantuan"]) {
			expect(within(card(title)).queryByText("Direncanakan")).toBeNull();
		}
	});

	it("states on the VibeDesign card that the module is not active", () => {
		render(<BentoHub />);

		expect(within(card("VibeDesign")).getByText(/belum aktif/i)).toBeDefined();
	});

	it("states on the VibeTemplate card that there is no catalog", () => {
		render(<BentoHub />);

		expect(
			within(card("VibeTemplate")).getByText(/belum ada di aplikasi ini/i),
		).toBeDefined();
	});

	it("still states the purpose of each planned module", () => {
		render(<BentoHub />);

		expect(
			within(card("VibeDesign")).getByText(/merancang antarmuka/i),
		).toBeDefined();
		expect(
			within(card("VibeTemplate")).getByText(/kerangka kerja/i),
		).toBeDefined();
	});
});
