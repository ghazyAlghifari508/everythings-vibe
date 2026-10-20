// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicPageHeader, PublicPageShell } from "./public-page-shell";

afterEach(() => {
	cleanup();
});

describe("PublicPageShell", () => {
	it("renders a <main> element with default public info layout classes", () => {
		const { container } = render(
			<PublicPageShell>
				<p>Konten Tes</p>
			</PublicPageShell>,
		);

		const main = container.querySelector("main");
		expect(main).not.toBeNull();
		expect(main?.className).toContain("mx-auto");
		expect(main?.className).toContain("max-w-4xl");
		expect(main?.className).toContain("px-4");
		expect(main?.className).toContain("sm:px-6");
		expect(main?.className).toContain("py-10");
		expect(main?.className).toContain("sm:py-14");
		expect(main?.className).toContain("gap-10");
		expect(screen.getByText("Konten Tes")).toBeDefined();
	});

	it("merges custom className overrides cleanly", () => {
		const { container } = render(
			<PublicPageShell className="custom-test-class">
				<div>Slot</div>
			</PublicPageShell>,
		);

		const main = container.querySelector("main");
		expect(main?.className).toContain("custom-test-class");
		expect(main?.className).toContain("mx-auto");
	});
});

describe("PublicPageHeader", () => {
	it("renders standard h1 typography and description", () => {
		render(
			<PublicPageHeader
				title="Judul Halaman Publik"
				description="Deskripsi singkat seputar informasi halaman."
			/>,
		);

		const heading = screen.getByRole("heading", {
			level: 1,
			name: "Judul Halaman Publik",
		});
		expect(heading).toBeDefined();
		expect(heading.className).toContain("text-3xl");
		expect(heading.className).toContain("sm:text-4xl");
		expect(heading.className).toContain("font-semibold");
		expect(heading.className).toContain("text-snow");

		const desc = screen.getByText(
			"Deskripsi singkat seputar informasi halaman.",
		);
		expect(desc).toBeDefined();
		expect(desc.tagName.toLowerCase()).toBe("p");
		expect(desc.className).toContain("text-fog");
	});

	it("renders additional children inside header when provided", () => {
		render(
			<PublicPageHeader title="Judul Saja">
				<div data-testid="extra-child">Aksi Header</div>
			</PublicPageHeader>,
		);

		expect(screen.getByTestId("extra-child")).toBeDefined();
	});
});
