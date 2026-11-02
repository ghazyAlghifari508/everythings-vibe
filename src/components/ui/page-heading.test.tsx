// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeading } from "./page-heading";

afterEach(() => {
	cleanup();
});

describe("PageHeading", () => {
	it("renders workspace variant by default with semantic h1 and elegant light weight", () => {
		render(<PageHeading>Ekstrak website</PageHeading>);

		const heading = screen.getByRole("heading", {
			level: 1,
			name: "Ekstrak website",
		});
		expect(heading).toBeDefined();
		expect(heading.className).toContain("font-inter");
		expect(heading.className).toContain("font-light");
		expect(heading.className).toContain("text-2xl");
		expect(heading.className).toContain("sm:text-3xl");
		expect(heading.className).toContain("text-snow");
	});

	it("renders display variant with pricing-inspired scaling", () => {
		render(<PageHeading variant="display">Mau ngapain hari ini?</PageHeading>);

		const heading = screen.getByRole("heading", {
			level: 1,
			name: "Mau ngapain hari ini?",
		});
		expect(heading).toBeDefined();
		expect(heading.className).toContain("font-inter");
		expect(heading.className).toContain("font-light");
		expect(heading.className).toContain("text-3xl");
		expect(heading.className).toContain("sm:text-[40px]");
		expect(heading.className).toContain("lg:text-[48px]");
	});

	it("renders section variant defaulting to h2 with medium weight", () => {
		render(<PageHeading variant="section">Daftar Fitur</PageHeading>);

		const heading = screen.getByRole("heading", {
			level: 2,
			name: "Daftar Fitur",
		});
		expect(heading).toBeDefined();
		expect(heading.className).toContain("font-inter");
		expect(heading.className).toContain("font-medium");
		expect(heading.className).toContain("text-xl");
		expect(heading.className).toContain("sm:text-2xl");
	});

	it("respects explicit polymorphic 'as' tag", () => {
		render(
			<PageHeading variant="workspace" as="h3">
				Judul Level 3
			</PageHeading>,
		);

		const heading = screen.getByRole("heading", {
			level: 3,
			name: "Judul Level 3",
		});
		expect(heading).toBeDefined();
		expect(heading.tagName.toLowerCase()).toBe("h3");
	});

	it("merges custom className cleanly", () => {
		render(
			<PageHeading variant="workspace" className="custom-override">
				Judul Kustom
			</PageHeading>,
		);

		const heading = screen.getByRole("heading", {
			level: 1,
			name: "Judul Kustom",
		});
		expect(heading.className).toContain("custom-override");
		expect(heading.className).toContain("font-light");
	});
});
