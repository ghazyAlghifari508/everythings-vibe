// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioHeader } from "./studio-header";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: null }),
	},
}));

describe("StudioHeader", () => {
	afterEach(() => cleanup());

	function renderHeader(overrides: Record<string, unknown> = {}) {
		return render(
			<StudioHeader
				title="KopiKultur Coffee Shop App"
				duplicating={false}
				exporting={false}
				canExport
				onDuplicate={vi.fn()}
				onExport={vi.fn()}
				{...overrides}
			/>,
		);
	}

	it("floats above the canvas without a full-width navbar surface", () => {
		const { container } = renderHeader();
		const header = container.querySelector("header");
		expect(header).not.toBeNull();
		const className = header?.className ?? "";
		// The canvas must show through behind the header: no opaque full-width
		// background, no divider border, and the band must be positioned as an
		// overlay rather than occupying layout space.
		expect(className).toContain("absolute");
		expect(className).toContain("inset-x-0");
		expect(className).toContain("top-0");
		expect(className).not.toContain("border-b");
		expect(className).toContain("pointer-events-none");
		// The header band must not paint its own full-width surface.
		expect(className.split(" ")).not.toContain("bg-charcoal");
		expect(className.split(" ")).not.toContain("bg-obsidian");
	});

	it("keeps project menu, title, export and account controls reachable", () => {
		renderHeader({ onAddFrame: vi.fn(), onDelete: vi.fn() });
		expect(screen.getByRole("button", { name: "Menu project" })).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Export project" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Profil dan tampilan" }),
		).toBeDefined();
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
			"KopiKultur Coffee Shop App",
		);
	});

	it("gives every interactive control a pointer-enabled surface", () => {
		renderHeader();
		for (const name of [
			"Menu project",
			"Export project",
			"Profil dan tampilan",
		]) {
			const button = screen.getByRole("button", { name });
			// Controls must opt back into pointer events so they stay clickable
			// while the surrounding header band stays pointer-transparent.
			expect(button.closest(".pointer-events-auto")).not.toBeNull();
		}
	});

	it("surfaces the exporting state on the export control", () => {
		renderHeader({ exporting: true });
		const exportButton = screen.getByRole("button", {
			name: "Export project",
		});
		expect(exportButton.querySelector("svg")).not.toBeNull();
	});
});
