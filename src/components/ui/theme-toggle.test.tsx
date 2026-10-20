// @vitest-environment jsdom
import { Moon01Icon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as nextThemes from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

vi.mock("next-themes", () => ({
	useTheme: vi.fn(),
}));

describe("ThemeToggle Component", () => {
	const mockSetTheme = vi.fn();

	beforeEach(() => {
		mockSetTheme.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders a recognizable crescent moon icon (Moon02Icon) and synchronized labels in light mode", () => {
		vi.mocked(nextThemes.useTheme).mockReturnValue({
			theme: "light",
			resolvedTheme: "light",
			setTheme: mockSetTheme,
			themes: ["light", "dark"],
			systemTheme: "light",
			forcedTheme: undefined,
		});

		render(<ThemeToggle />);

		const button = screen.getByRole("button", {
			name: /switch to dark mode/i,
		});
		expect(button).toBeDefined();
		expect(button.getAttribute("title")).toBe("Switch to dark mode");
		expect(button.getAttribute("aria-label")).toBe("Switch to dark mode");

		// Verify SVG path contains Moon02Icon crescent glyph
		const svg = button.querySelector("svg");
		expect(svg).not.toBeNull();
		const path = svg?.querySelector("path");
		expect(path).not.toBeNull();

		// Crescent path starts with M21.5 14.0784
		const pathData = path?.getAttribute("d") ?? "";
		expect(pathData).toContain("M21.5 14.0784");

		// Verify Moon01Icon (circular moon with craters) is NOT rendered
		expect(pathData).not.toContain("M16 16C16 17.1046");
		expect(svg?.querySelectorAll("path").length).toBe(1);

		// Click switches to dark mode
		fireEvent.click(button);
		expect(mockSetTheme).toHaveBeenCalledWith("dark");
	});

	it("renders sun icon (Sun01Icon) and synchronized labels in dark mode", () => {
		vi.mocked(nextThemes.useTheme).mockReturnValue({
			theme: "dark",
			resolvedTheme: "dark",
			setTheme: mockSetTheme,
			themes: ["light", "dark"],
			systemTheme: "dark",
			forcedTheme: undefined,
		});

		render(<ThemeToggle />);

		const button = screen.getByRole("button", {
			name: /switch to light mode/i,
		});
		expect(button).toBeDefined();
		expect(button.getAttribute("title")).toBe("Switch to light mode");
		expect(button.getAttribute("aria-label")).toBe("Switch to light mode");

		const svg = button.querySelector("svg");
		expect(svg).not.toBeNull();
		const path = svg?.querySelector("path");
		expect(path).not.toBeNull();
		const pathData = path?.getAttribute("d") ?? "";
		const expectedSunPath = (Sun01Icon[0][1] as { d: string }).d;
		expect(pathData).toBe(expectedSunPath);

		// Click switches to light mode
		fireEvent.click(button);
		expect(mockSetTheme).toHaveBeenCalledWith("light");
	});

	it("preserves required button dimensions and styling classes", () => {
		vi.mocked(nextThemes.useTheme).mockReturnValue({
			theme: "light",
			resolvedTheme: "light",
			setTheme: mockSetTheme,
			themes: ["light", "dark"],
			systemTheme: "light",
			forcedTheme: undefined,
		});

		render(<ThemeToggle />);

		const button = screen.getByRole("button");
		expect(button.className).toContain("h-8");
		expect(button.className).toContain("w-8");
		expect(button.className).toContain("rounded-md");
		expect(button.className).toContain("text-fog");
		expect(button.className).toContain("focus-visible:ring-1");
	});

	it("verifies code-level SVG glyph definition: Moon02Icon is a single-path crescent while Moon01Icon is multi-path circle with craters", () => {
		// Moon02Icon has 1 path element representing a single curved crescent
		expect(Moon02Icon.length).toBe(1);
		const moon02Props = Moon02Icon[0][1] as { d: string };
		expect(moon02Props.d).toContain("M21.5 14.0784");

		// Moon01Icon has 4 path elements representing circle + craters
		expect(Moon01Icon.length).toBe(4);
	});
});
