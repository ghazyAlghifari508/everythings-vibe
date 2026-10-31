// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignMdSourcePanel } from "../components/design-md-source-panel";

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
		const sourceTab = screen.getByRole("tab", { name: /source/i });
		const panelId = sourceTab.getAttribute("aria-controls") ?? "";
		expect(panelId).toBeTruthy();
		const source = document.getElementById(panelId);
		expect(source?.textContent).toBe(DESIGN_MD);
	});

	it("uses unique tab and panel ids per instance", () => {
		const first = renderPanel();
		const second = render(
			<DesignMdSourcePanel designMd={DESIGN_MD} onImplementAgent={vi.fn()} />,
		);
		const tabs = screen.getAllByRole("tab", { name: /rendered|source/i });
		expect(tabs.length).toBeGreaterThanOrEqual(4);
		const ids = tabs.map((tab) => tab.getAttribute("id"));
		expect(new Set(ids).size).toBe(ids.length);
		for (const tab of tabs) {
			const controls = tab.getAttribute("aria-controls") ?? "";
			expect(document.getElementById(controls)).toBeTruthy();
		}
		first.unmount();
		second.unmount();
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

	it("states incomplete analysis gracefully without leaking internal errors", () => {
		const onRetry = vi.fn();
		const { rerender } = render(
			<DesignMdSourcePanel
				designMd={DESIGN_MD}
				onImplementAgent={vi.fn()}
				inspectorSource="observed"
				enrichment="unavailable"
				enrichmentDetail="Model timeout."
				onRetryEnrichment={onRetry}
			/>,
		);
		expect(
			screen.getByText(/sebagian panduan komponen belum tersedia/i),
		).toBeDefined();
		expect(
			screen.queryByText(/panduan desain belum sepenuhnya selesai/i),
		).toBeNull();
		expect(screen.queryByText(/analisis ai belum lengkap/i)).toBeNull();
		expect(
			screen.queryByText(/pengukuran lengkap tanpa narasi ai/i),
		).toBeNull();
		expect(screen.queryByText(/ai tidak memenuhi kontrak/i)).toBeNull();
		expect(screen.queryByText(/enrichment unavailable/i)).toBeNull();
		expect(screen.queryByText(/schema validation failed/i)).toBeNull();

		const retryButton = screen.getByRole("button", {
			name: /lengkapi panduan komponen/i,
		});
		expect(retryButton).toBeDefined();
		fireEvent.click(retryButton);
		expect(onRetry).toHaveBeenCalledTimes(1);

		rerender(
			<DesignMdSourcePanel
				designMd={DESIGN_MD}
				onImplementAgent={vi.fn()}
				inspectorSource="observed"
				enrichment="applied"
			/>,
		);
		expect(
			screen.queryByText(/sebagian panduan komponen belum tersedia/i),
		).toBeNull();
		expect(
			screen.queryByText(/panduan desain belum sepenuhnya selesai/i),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: /lengkapi panduan komponen/i }),
		).toBeNull();
	});

	it("switches between rendered markdown and raw source", () => {
		renderPanel();
		expect(screen.getByRole("tab", { name: /rendered/i })).toBeDefined();
		const renderedTab = screen.getByRole("tab", { name: /rendered/i });
		const sourceTab = screen.getByRole("tab", { name: /source/i });
		const renderedPanel = document.getElementById(
			renderedTab.getAttribute("aria-controls") ?? "",
		);
		const sourcePanel = document.getElementById(
			sourceTab.getAttribute("aria-controls") ?? "",
		);
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

	it("moves focus with arrow keys between rendered and source tabs", () => {
		renderPanel();
		const renderedTab = screen.getByRole("tab", {
			name: /rendered/i,
		}) as HTMLElement;
		const sourceTab = screen.getByRole("tab", {
			name: /source/i,
		}) as HTMLElement;
		renderedTab.focus();
		fireEvent.keyDown(renderedTab, { key: "ArrowRight" });
		expect(document.activeElement).toBe(sourceTab);
		fireEvent.keyDown(sourceTab, { key: "ArrowLeft" });
		expect(document.activeElement).toBe(renderedTab);
	});

	it("downloads the canonical DESIGN.md filename without domain coupling", async () => {
		const seen: string[] = [];
		renderPanel();
		const appendChild = vi
			.spyOn(document.body, "appendChild")
			.mockImplementation(((node: Node) => {
				if (node instanceof HTMLAnchorElement) seen.push(node.download);
				return node;
			}) as typeof document.body.appendChild);
		renderPanel();
		fireEvent.click(screen.getByRole("button", { name: "Download DESIGN.md" }));
		expect(seen).toEqual(["DESIGN.md"]);
		appendChild.mockRestore();
	});

	it("shows no theme switcher when only one verified theme is available", () => {
		renderPanel();
		expect(screen.queryByRole("tab", { name: /^light$/i })).toBeNull();
		expect(screen.queryByRole("tab", { name: /^dark$/i })).toBeNull();
	});

	it("filters rendered and source views when both themes are verified", () => {
		const lightMd = `${"# Acme - Style Reference\n\n## Tokens - Colors\n\nBase light.\n\n### Capture 1: 1440x900, browser preference light (theme light)\n\nLight tokens.\n"}`;
		const darkMd = `${"# Acme - Style Reference\n\n## Tokens - Colors\n\nBase dark.\n\n### Capture 2: 1440x900, browser preference dark (theme dark)\n\nDark tokens.\n"}`;
		render(
			<DesignMdSourcePanel
				designMd={DESIGN_MD}
				onImplementAgent={vi.fn()}
				themeDocuments={[
					{ theme: "light", designMd: lightMd },
					{ theme: "dark", designMd: darkMd },
				]}
			/>,
		);
		const lightTab = screen.getByRole("tab", { name: /^light$/i });
		const darkTab = screen.getByRole("tab", { name: /^dark$/i });
		expect(lightTab.getAttribute("aria-selected")).toBe("true");
		fireEvent.click(screen.getByRole("tab", { name: /source/i }));
		expect(
			document.getElementById(
				screen
					.getByRole("tab", { name: /source/i })
					.getAttribute("aria-controls") ?? "",
			)?.textContent,
		).toBe(lightMd);
		fireEvent.click(darkTab);
		expect(darkTab.getAttribute("aria-selected")).toBe("true");
		expect(
			document.getElementById(
				screen
					.getByRole("tab", { name: /source/i })
					.getAttribute("aria-controls") ?? "",
			)?.textContent,
		).toBe(darkMd);
		fireEvent.click(screen.getByRole("tab", { name: /rendered/i }));
		lightTab.focus();
		fireEvent.keyDown(lightTab, { key: "ArrowRight" });
		expect(document.activeElement).toBe(darkTab);
	});

	it("copies and downloads the full canonical document when a theme filter is active", async () => {
		const { unmount } = renderPanel();
		unmount();
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		const blobSpy = vi.spyOn(globalThis, "Blob");
		const lightMd = `# Acme\n\n### Capture 1: light theme\n\nLight.`;
		render(
			<DesignMdSourcePanel
				designMd={DESIGN_MD}
				onImplementAgent={vi.fn()}
				themeDocuments={[
					{ theme: "light", designMd: lightMd },
					{
						theme: "dark",
						designMd: `# Acme\n\n### Capture 2: dark theme\n\nDark.`,
					},
				]}
			/>,
		);
		fireEvent.click(screen.getByRole("tab", { name: /^dark$/i }));
		fireEvent.click(screen.getByRole("button", { name: "Salin DESIGN.md" }));
		expect(writeText).toHaveBeenCalledWith(DESIGN_MD);
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Download DESIGN.md" }));
		expect(blobSpy).toHaveBeenCalledWith([DESIGN_MD], {
			type: "text/markdown;charset=utf-8",
		});
	});
});
