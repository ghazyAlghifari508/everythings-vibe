// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

	// A card rendered as a div with an onClick handler has no implicit link
	// role, no href, and is unreachable by keyboard. Counting roles instead of
	// titles is what catches a regression back to that pattern.
	it("renders exactly four real links so no card is a click-only div", () => {
		render(<BentoHub />);

		expect(screen.getAllByRole("link")).toHaveLength(4);
	});
});
