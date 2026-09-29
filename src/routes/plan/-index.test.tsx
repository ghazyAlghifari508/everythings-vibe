// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanOptionsPage } from "./index";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
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

// The breadcrumb contributes a "Home" link, so destinations are located by
// href rather than by position or by visible copy.
function linkHrefs(): Array<string | null> {
	return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

afterEach(() => {
	cleanup();
});

describe("PlanOptionsPage", () => {
	it("offers greenfield and existing-codebase as the only two planning paths", () => {
		render(<PlanOptionsPage />);

		const planDestinations = linkHrefs().filter(
			(href) => href === "/plan/new" || href === "/plan/codebase",
		);
		expect(planDestinations).toEqual(["/plan/new", "/plan/codebase"]);
	});

	it("keeps each option label on its own destination", () => {
		render(<PlanOptionsPage />);

		expect(screen.getByText("Opsi 1").closest("a")?.getAttribute("href")).toBe(
			"/plan/new",
		);
		expect(screen.getByText("Opsi 2").closest("a")?.getAttribute("href")).toBe(
			"/plan/codebase",
		);
	});

	it("offers a way back to the hub from the options screen", () => {
		render(<PlanOptionsPage />);

		expect(linkHrefs()).toContain("/");
	});
});
