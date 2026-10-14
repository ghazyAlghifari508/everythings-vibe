// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignMdSourcePanel } from "./design-md-source-panel";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const LONG_SOURCE_URL = `https://source.example/${"path-segment-".repeat(16)}`;
const DESIGN_MD = `# Acme - Style Reference

## Tokens - Colors
Body here.
| Name | Value |
| --- | --- |
| Source URL | ${LONG_SOURCE_URL} |

\`\`\`css
--source-url: url(${LONG_SOURCE_URL});
\`\`\`  \n`;

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

	it("exposes rendered/source tabs without framework tabs", () => {
		const { container } = renderPanel();
		expect(screen.getByRole("tab", { name: /rendered/i })).toBeDefined();
		expect(screen.getByRole("tab", { name: /source/i })).toBeDefined();
		expect(screen.queryByRole("tab", { name: /tailwind/i })).toBeNull();
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/design tokens/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});

	it("renders the authoritative source without changing whitespace", () => {
		renderPanel();
		const source = screen
			.getByRole("region", { name: "Sumber DESIGN.md" })
			.querySelector("#designmd-source-panel");
		expect(source?.textContent).toBe(DESIGN_MD);
	});

	it("copies DESIGN.md to the clipboard with feedback", async () => {
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		renderPanel();
		fireEvent.click(screen.getByRole("button", { name: "Salin DESIGN.md" }));
		expect(writeText).toHaveBeenCalledWith(DESIGN_MD);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
	});

	it("downloads the exact DESIGN.md source with feedback", async () => {
		const blobSpy = vi.spyOn(globalThis, "Blob");
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		renderPanel();
		fireEvent.click(screen.getByRole("button", { name: "Download DESIGN.md" }));
		expect(blobSpy).toHaveBeenCalledWith([DESIGN_MD], {
			type: "text/markdown;charset=utf-8",
		});
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

	it("states incomplete AI analysis only when enrichment is unavailable", () => {
		const { rerender } = render(
			<DesignMdSourcePanel
				designMd={DESIGN_MD}
				domain="acme.example"
				onImplementAgent={vi.fn()}
				inspectorSource="observed"
				enrichment="unavailable"
				enrichmentDetail="Model timeout."
			/>,
		);
		expect(
			screen.getAllByText(/analisis ai belum lengkap/i).length,
		).toBeGreaterThan(0);
		expect(
			screen.queryByText(/pengukuran lengkap tanpa narasi ai/i),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: /coba lagi|retry/i }),
		).toBeNull();
		rerender(
			<DesignMdSourcePanel
				designMd={DESIGN_MD}
				domain="acme.example"
				onImplementAgent={vi.fn()}
				inspectorSource="observed"
				enrichment="applied"
			/>,
		);
		expect(screen.queryByText(/analisis ai belum lengkap/i)).toBeNull();
	});

	it("switches between rendered markdown and raw source", () => {
		const { container } = renderPanel();
		expect(screen.getByRole("tab", { name: /rendered/i })).toBeDefined();
		const renderedPanel = container.querySelector("#designmd-rendered-panel");
		const sourcePanel = container.querySelector("#designmd-source-panel");
		expect(renderedPanel).toBeDefined();
		expect(sourcePanel).toBeDefined();
		expect((renderedPanel as HTMLElement).hidden).toBe(false);
		expect((sourcePanel as HTMLElement).hidden).toBe(true);
		fireEvent.click(screen.getByRole("tab", { name: /source/i }));
		expect((sourcePanel as HTMLElement).hidden).toBe(false);
		expect((renderedPanel as HTMLElement).hidden).toBe(true);
		expect(
			screen
				.getByRole("tab", { name: /source/i })
				.getAttribute("aria-selected"),
		).toBe("true");
	});
});
