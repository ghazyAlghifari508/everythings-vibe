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
	it("opens existing-codebase from VibePlan into the saved-project library", () => {
		render(<PlanOptionsPage />);

		expect(screen.getByText("Opsi 2").closest("a")?.getAttribute("href")).toBe(
			"/codebases",
		);
		expect(linkHrefs()).toContain("/plan/new");
		expect(linkHrefs()).not.toContain("/plan/codebase");
	});

	it("keeps the greenfield option on its own destination", () => {
		render(<PlanOptionsPage />);

		expect(screen.getByText("Opsi 1").closest("a")?.getAttribute("href")).toBe(
			"/plan/new",
		);
	});

	it("offers a way back to the hub from the options screen", () => {
		render(<PlanOptionsPage />);

		expect(linkHrefs()).toContain("/");
	});
});
