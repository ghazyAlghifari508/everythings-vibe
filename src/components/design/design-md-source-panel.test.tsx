// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignMdSourcePanel } from "./design-md-source-panel";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const DESIGN_MD = "# Acme - Style Reference\n\n## Tokens - Colors\nBody here.";

function renderPanel(onImplementAgent: () => void = vi.fn()) {
	return render(
		<DesignMdSourcePanel
			designMd={DESIGN_MD}
			domain="acme.example"
			onImplementAgent={onImplementAgent}
		/>,
	);
}

describe("DesignMdSourcePanel", () => {
	it("renders a single DESIGN.md header with compact actions", () => {
		renderPanel();
		expect(screen.getByText("DESIGN.md")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Salin DESIGN.md" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Download DESIGN.md" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /implement ke ai agent/i }),
		).toBeDefined();
	});

	it("exposes no framework tabs or density modes", () => {
		const { container } = renderPanel();
		expect(
			screen.queryByRole("tab", { name: /tailwind/i }),
		).toBeNull();
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/design tokens/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});

	it("renders the authoritative DESIGN.md source", () => {
		renderPanel();
		expect(screen.getByText(/Acme - Style Reference/)).toBeDefined();
		expect(screen.getByText(/Body here/)).toBeDefined();
	});

	it("copies DESIGN.md to the clipboard with feedback", async () => {
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		renderPanel();
		fireEvent.click(screen.getByRole("button", { name: "Salin DESIGN.md" }));
		expect(writeText).toHaveBeenCalledWith(DESIGN_MD);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
	});

	it("downloads DESIGN.md with feedback", async () => {
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		renderPanel();
		fireEvent.click(
			screen.getByRole("button", { name: "Download DESIGN.md" }),
		);
		expect(await screen.findByText(/mulai diunduh/i)).toBeDefined();
	});

	it("delegates the AI agent handoff to the parent handler", () => {
		const onImplementAgent = vi.fn();
		renderPanel(onImplementAgent);
		fireEvent.click(
			screen.getByRole("button", { name: /implement ke ai agent/i }),
		);
		expect(onImplementAgent).toHaveBeenCalledTimes(1);
	});
});
