// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HubBreadcrumb } from "./hub-breadcrumb";

const linkTargets: string[] = [];

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => {
		linkTargets.push(to);
		return (
			<a href={to} className={className}>
				{children}
			</a>
		);
	},
}));

afterEach(() => {
	cleanup();
	linkTargets.length = 0;
});

function trail(): string[] {
	const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
	return (nav.textContent ?? "").split("\u200f").filter(Boolean);
}

describe("HubBreadcrumb", () => {
	it("renders Home as the only ancestor when none are supplied", () => {
		render(<HubBreadcrumb current="VibePlan" />);

		expect(screen.getByRole("link", { name: "Home" })).toBeDefined();
		expect(
			screen.getByRole("link", { name: "Home" }).getAttribute("href"),
		).toBe("/");
		expect(document.querySelectorAll("a")).toHaveLength(1);
	});

	it("renders one link per ancestor in the order supplied", () => {
		render(
			<HubBreadcrumb
				current="Hubungkan Repository"
				ancestors={[
					{ label: "VibePlan", to: "/plan" },
					{ label: "Project Tersimpan", to: "/codebases" },
				]}
			/>,
		);

		expect(screen.getByRole("link", { name: "Home" })).toBeDefined();
		expect(screen.getByRole("link", { name: "VibePlan" })).toBeDefined();
		expect(
			screen.getByRole("link", { name: "Project Tersimpan" }),
		).toBeDefined();
		// The current page is never a link.
		expect(
			screen.queryByRole("link", { name: "Hubungkan Repository" }),
		).toBeNull();
	});

	it("keeps the supplied hierarchy order in the DOM", () => {
		render(
			<HubBreadcrumb
				current="Hubungkan Repository"
				ancestors={[
					{ label: "VibePlan", to: "/plan" },
					{ label: "Project Tersimpan", to: "/codebases" },
				]}
			/>,
		);

		expect(linkTargets).toEqual(["/", "/plan", "/codebases"]);
	});

	it("marks only the final crumb as the current page", () => {
		render(
			<HubBreadcrumb
				current="Hubungkan Repository"
				ancestors={[
					{ label: "VibePlan", to: "/plan" },
					{ label: "Project Tersimpan", to: "/codebases" },
				]}
			/>,
		);

		const current = document.querySelectorAll('[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0]?.textContent).toBe("Hubungkan Repository");
	});

	it("renders a single-ancestor trail exactly like the library page", () => {
		render(
			<HubBreadcrumb
				current="Project Tersimpan"
				ancestors={[{ label: "VibePlan", to: "/plan" }]}
			/>,
		);

		expect(linkTargets).toEqual(["/", "/plan"]);
		expect(trail()).toEqual(["HomeVibePlanProject Tersimpan"]);
	});
});
