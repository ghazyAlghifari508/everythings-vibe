// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { EverythingsVibeMark, Logo, VibeEverythingMark } from "./logo";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		className,
		style,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
		style?: React.CSSProperties;
	}) => (
		<a href={to} className={className} style={style}>
			{children}
		</a>
	),
}));

describe("Logo component", () => {
	it("renders the canonical everythings-vibe brand text and link", () => {
		render(<Logo />);
		const link = screen.getByRole("link", { name: /everythings-vibe/i });
		expect(link).toBeDefined();
		expect(link.getAttribute("href")).toBe("/");
		expect(screen.getByText("everythings-vibe")).toBeDefined();
	});

	it("renders mark with aria-hidden true and exports backward-compatible mark alias", () => {
		const { container } = render(<EverythingsVibeMark size={24} />);
		const svg = container.querySelector("svg");
		expect(svg).toBeDefined();
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
		expect(svg?.getAttribute("width")).toBe("24");
		expect(VibeEverythingMark).toBe(EverythingsVibeMark);
	});
});
