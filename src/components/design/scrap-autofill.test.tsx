// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapModeSwitcher } from "./scrap-mode-switcher";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
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

afterEach(() => {
	cleanup();
});

describe("VibeDesign Scrap Autofill Styling & Contract", () => {
	it("ensures URL inputs declare autocomplete and token-bound autofill background", () => {
		render(<ScrapModeSwitcher />);

		const designInput = screen.getByLabelText(
			/Website yang ingin di-generate DESIGN\.md/i,
		);
		expect(designInput.getAttribute("type")).toBe("url");
		expect(designInput.getAttribute("autoComplete")).toBe("url");
		expect(designInput.getAttribute("name")).toBe("url");
		expect(designInput.className).toContain(
			"[--autofill-bg:var(--color-charcoal)]",
		);
	});

	it("verifies global stylesheet defines comprehensive Chromium WebKit autofill rules", () => {
		const globalsCssPath = resolve(process.cwd(), "src/app/globals.css");
		const cssContent = readFileSync(globalsCssPath, "utf-8");

		// Chromium & WebKit pseudoclasses
		expect(cssContent).toContain("input:-webkit-autofill");
		expect(cssContent).toContain("input:-webkit-autofill:hover");
		expect(cssContent).toContain("input:-webkit-autofill:focus");
		expect(cssContent).toContain("input:-webkit-autofill:active");

		// Standard CSS pseudoclasses
		expect(cssContent).toContain("input:autofill");
		expect(cssContent).toContain("input:autofill:hover");
		expect(cssContent).toContain("input:autofill:focus");
		expect(cssContent).toContain("input:autofill:active");

		// Surface-aware contextual token support
		expect(cssContent).toContain(".bg-charcoal input:-webkit-autofill");
		expect(cssContent).toContain(".bg-onyx input:-webkit-autofill");
		expect(cssContent).toContain(".bg-steel input:-webkit-autofill");

		// Uses design tokens without hardcoded colors
		expect(cssContent).toContain("var(--color-charcoal)");
		expect(cssContent).toContain("var(--color-snow");
		expect(cssContent).toContain("var(--bg-input)");
		expect(cssContent).toContain("-webkit-text-fill-color");
		expect(cssContent).toContain("caret-color");
	});
});
