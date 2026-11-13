// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { DesignResult } from "../components/design-result";
import { buildDesignModel } from "../services/design-model";
import type { VisualEvidence } from "../services/design-visual-evidence";
import { renderDesignMd } from "../utils/design-md-render";
import {
	designThemeNotice,
	designThemeOptions,
	designThemeReport,
} from "../utils/design-view-contexts";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

type Scheme = "auto" | "light" | "dark";
type ThemeRequest = "auto" | "light" | "dark" | "both";

// One capture as the pipeline records it: the browser preference it asked for is
// separate from the appearance the canvas actually rendered.
function capture(options: {
	width?: number;
	height?: number;
	colorScheme?: Scheme;
	rendered?: "light" | "dark" | "unknown";
}): VisualEvidence {
	const view = structuredClone(FIXTURE);
	view.viewport = {
		width: options.width ?? 1440,
		height: options.height ?? 900,
	};
	view.colorScheme = options.colorScheme ?? "light";
	const canvas = view.elements.find((element) => element.role === "canvas");
	if (canvas) {
		if (options.rendered === "dark")
			canvas.properties["background-color"] = "rgb(0, 0, 0)";
		// A mid grey canvas establishes no appearance at all.
		if (options.rendered === "unknown")
			canvas.properties["background-color"] = "rgb(128, 128, 128)";
	}
	return view;
}

// Mirrors the capture plan: viewports then schemes, so capture order is stable.
function run(settings: {
	viewport: "desktop" | "mobile" | "both";
	theme: ThemeRequest;
	views: VisualEvidence[];
}): VisualEvidence {
	const [first, ...rest] = settings.views;
	if (!first) throw new Error("A run needs at least one capture");
	return {
		...first,
		settings: {
			viewport: settings.viewport,
			theme: settings.theme,
			depth: "standard",
			focus: "complete",
			codeReference: "both",
		},
		additionalViews: rest,
	};
}

function modelOf(evidence: VisualEvidence) {
	return buildDesignModel(evidence);
}

// The reported Notion run: light and dark were both requested, every capture
// rendered the light appearance while Desktop and Mobile were both measured.
function requestedBothRenderedLight(): VisualEvidence {
	return run({
		viewport: "both",
		theme: "both",
		views: [
			capture({ colorScheme: "light", rendered: "light" }),
			capture({ colorScheme: "dark", rendered: "light" }),
			capture({
				width: 390,
				height: 844,
				colorScheme: "light",
				rendered: "light",
			}),
			capture({
				width: 390,
				height: 844,
				colorScheme: "dark",
				rendered: "light",
			}),
		],
	});
}

// Desktop verified both appearances; mobile confirmed light only.
function verifiedDesktopUnverifiedMobile(): VisualEvidence {
	return run({
		viewport: "both",
		theme: "both",
		views: [
			capture({ colorScheme: "light", rendered: "light" }),
			capture({ colorScheme: "dark", rendered: "dark" }),
			capture({
				width: 390,
				height: 844,
				colorScheme: "light",
				rendered: "light",
			}),
			capture({
				width: 390,
				height: 844,
				colorScheme: "dark",
				rendered: "light",
			}),
		],
	});
}

function renderResult(evidence: VisualEvidence) {
	const designMd = renderDesignMd(modelOf(evidence));
	return render(
		<DesignResult
			sourceUrl="https://acme.example/pricing"
			domain="acme.example"
			designMd={designMd}
			visualEvidence={evidence}
		/>,
	);
}

function viewportOption(name: "Desktop" | "Mobile"): HTMLElement {
	return screen.getByRole("radio", { name });
}

const NOTICE_TITLE = "Tema gelap belum terverifikasi pada hasil ini.";
const NOTICE_DETAIL =
	"Capture dengan preferensi gelap masih menampilkan tampilan terang.";

describe("requested versus verified themes", () => {
	it("reports a single light capture as verified and silent", () => {
		const evidence = run({
			viewport: "desktop",
			theme: "light",
			views: [capture({ colorScheme: "light", rendered: "light" })],
		});
		const model = modelOf(evidence);
		expect(designThemeReport(model, "desktop")).toEqual({
			verified: ["light"],
			unverified: [],
			captureMissing: false,
		});
		expect(designThemeNotice(model, "desktop")).toBeNull();
	});

	it("reports a verified dark capture without a warning", () => {
		const evidence = run({
			viewport: "desktop",
			theme: "dark",
			views: [capture({ colorScheme: "dark", rendered: "dark" })],
		});
		const report = designThemeReport(modelOf(evidence), "desktop");
		expect(report.verified).toEqual(["dark"]);
		expect(report.unverified).toEqual([]);
	});

	it("offers both themes and no notice when both were measured", () => {
		const evidence = run({
			viewport: "desktop",
			theme: "both",
			views: [
				capture({ colorScheme: "light", rendered: "light" }),
				capture({ colorScheme: "dark", rendered: "dark" }),
			],
		});
		const model = modelOf(evidence);
		expect(designThemeOptions(model, "desktop")).toEqual(["light", "dark"]);
		expect(designThemeReport(model, "desktop")).toEqual({
			verified: ["light", "dark"],
			unverified: [],
			captureMissing: false,
		});
		expect(designThemeNotice(model, "desktop")).toBeNull();
		renderResult(evidence);
		expect(screen.getByRole("tab", { name: /^light$/i })).toBeDefined();
		expect(screen.getByRole("tab", { name: /^dark$/i })).toBeDefined();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("explains a requested dark preference the capture never verified", () => {
		const model = modelOf(requestedBothRenderedLight());
		expect(designThemeOptions(model, "desktop")).toEqual([]);
		expect(designThemeReport(model, "desktop")).toEqual({
			verified: ["light"],
			unverified: [{ requested: "dark", detail: NOTICE_DETAIL }],
			captureMissing: false,
		});
		expect(designThemeNotice(model, "desktop")).toEqual({
			title: NOTICE_TITLE,
			detail: NOTICE_DETAIL,
		});

		renderResult(requestedBothRenderedLight());
		// The measured viewports stay selectable; only the unverified theme is not.
		expect(
			screen.getByRole("radiogroup", { name: /konteks viewport/i }),
		).toBeDefined();
		expect(screen.getByRole("status").textContent).toContain(NOTICE_TITLE);
		expect(screen.getByRole("status").textContent).toContain(NOTICE_DETAIL);
		// No fabricated tab and no disabled dark control.
		expect(screen.queryByRole("tab", { name: /^dark$/i })).toBeNull();
		expect(screen.queryByRole("tab", { name: /^light$/i })).toBeNull();
		expect(screen.getByRole("tab", { name: /rendered/i })).toBeDefined();
		// The explanation sits with the context controls, not only in the document.
		const controls = screen.getByRole("radiogroup", {
			name: /konteks viewport/i,
		});
		expect(controls.closest("section")).toBe(
			screen.getByRole("status").closest("section"),
		);
	});

	it("keeps availability per measured viewport", () => {
		const model = modelOf(verifiedDesktopUnverifiedMobile());
		expect(designThemeReport(model, "desktop").unverified).toEqual([]);
		expect(designThemeReport(model, "mobile")).toEqual({
			verified: ["light"],
			unverified: [{ requested: "dark", detail: NOTICE_DETAIL }],
			captureMissing: false,
		});
		expect(designThemeNotice(model, "mobile")?.title).toBe(NOTICE_TITLE);
	});

	it("stays silent when no theme was requested", () => {
		const evidence = run({
			viewport: "both",
			theme: "auto",
			views: [
				capture({ colorScheme: "auto", rendered: "light" }),
				capture({
					width: 390,
					height: 844,
					colorScheme: "auto",
					rendered: "light",
				}),
			],
		});
		const model = modelOf(evidence);
		expect(designThemeReport(model, "desktop").unverified).toEqual([]);
		expect(designThemeNotice(model, "desktop")).toBeNull();
		expect(designThemeNotice(model, "mobile")).toBeNull();
		renderResult(evidence);
		expect(screen.queryByRole("status")).toBeNull();
		expect(
			screen.queryByText(/belum terverifikasi pada hasil ini/i),
		).toBeNull();
	});

	it("separates a failed capture from an unverified theme", () => {
		expect(designThemeReport(null, null).captureMissing).toBe(true);
		expect(designThemeNotice(null, null)).toEqual({
			title: "Status tema belum dapat diverifikasi pada hasil ini.",
			detail:
				"Hasil ini belum menyertakan data pengukuran, sehingga pilihan tema belum tersedia.",
		});
		// The panel states the same state without claiming a theme was requested.
		render(
			<DesignResult
				sourceUrl="https://acme.example/pricing"
				domain="acme.example"
				designMd="# Legacy - Style Reference\n"
			/>,
		);
		expect(screen.getByRole("status").textContent).toContain(
			"Status tema belum dapat diverifikasi pada hasil ini.",
		);
		expect(screen.queryByRole("tab", { name: /^dark$/i })).toBeNull();
		// A capture whose appearance cannot be established is not the same state.
		const indeterminate = run({
			viewport: "desktop",
			theme: "dark",
			views: [capture({ colorScheme: "dark", rendered: "unknown" })],
		});
		const report = designThemeReport(modelOf(indeterminate), "desktop");
		expect(report.captureMissing).toBe(false);
		expect(report.unverified[0]?.detail).toContain(
			"tidak menentukan tampilan yang dirender",
		);
		// A requested appearance with no capture of its own is a third state: the
		// request is still reported, and it is still never offered as a tab.
		const halfCaptured = run({
			viewport: "desktop",
			theme: "both",
			views: [capture({ colorScheme: "light", rendered: "light" })],
		});
		const partial = designThemeReport(modelOf(halfCaptured), "desktop");
		expect(partial.unverified.map((note) => note.requested)).toEqual(["dark"]);
		expect(partial.unverified[0]?.detail).toContain("tidak ada pada hasil ini");
	});
});

describe("theme availability in the DESIGN.md result", () => {
	it("updates the notice, the options and the source when the viewport changes", () => {
		renderResult(verifiedDesktopUnverifiedMobile());
		expect(screen.getByRole("tab", { name: /^dark$/i })).toBeDefined();
		expect(screen.queryByRole("status")).toBeNull();

		fireEvent.click(screen.getByRole("tab", { name: /^dark$/i }));
		expect(
			screen
				.getByRole("tab", { name: /^dark$/i })
				.getAttribute("aria-selected"),
		).toBe("true");
		fireEvent.click(screen.getByRole("tab", { name: /source/i }));
		const source = () =>
			document.getElementById(
				screen
					.getByRole("tab", { name: /source/i })
					.getAttribute("aria-controls") ?? "",
			)?.textContent;
		expect(source()).toContain("### Capture 2");

		fireEvent.click(viewportOption("Mobile"));
		// The unverified dark context cannot keep the previous selection.
		expect(screen.queryByRole("tab", { name: /^dark$/i })).toBeNull();
		expect(screen.getByRole("status").textContent).toContain(NOTICE_TITLE);
		expect(screen.getByText(/pratinjau terfilter ke mobile/i)).toBeDefined();
		expect(source()).toContain("### Capture 3");
		expect(source()).not.toContain("### Capture 1");

		fireEvent.click(viewportOption("Desktop"));
		// Dark is verified here again, so the still-valid selection returns; the
		// mobile context never offered it, so nothing unsupported was ever shown.
		expect(screen.queryByRole("status")).toBeNull();
		expect(
			screen
				.getByRole("tab", { name: /^dark$/i })
				.getAttribute("aria-selected"),
		).toBe("true");
	});

	it("drives the inspector and the document panel from one measured context", () => {
		renderResult(verifiedDesktopUnverifiedMobile());
		const inspectorContext = () =>
			screen.getByText(/konteks terukur:/i).textContent;
		expect(inspectorContext()).toContain("Desktop");
		expect(screen.getByText(/pratinjau terfilter ke desktop/i)).toBeDefined();

		fireEvent.click(viewportOption("Mobile"));
		expect(inspectorContext()).toContain("Mobile");
		expect(screen.getByText(/pratinjau terfilter ke mobile/i)).toBeDefined();
		expect(screen.getByRole("status").textContent).toContain(NOTICE_TITLE);
	});

	it("keeps copy and download on the canonical document while filtering the view", async () => {
		const writeText = vi.fn(async (_value: string) => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:mock"),
			revokeObjectURL: vi.fn(),
		});
		const blobSpy = vi.spyOn(globalThis, "Blob");
		const evidence = verifiedDesktopUnverifiedMobile();
		const canonical = renderDesignMd(modelOf(evidence));
		renderResult(evidence);

		fireEvent.click(viewportOption("Mobile"));
		fireEvent.click(screen.getByRole("button", { name: "Salin DESIGN.md" }));
		expect(writeText).toHaveBeenCalledWith(canonical);
		const copied = String(writeText.mock.calls[0]?.[0]);
		expect(copied).toContain("### Capture 1");
		expect(copied).toContain("### Capture 4");
		expect(await screen.findByText(/tersalin ke clipboard/i)).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Download DESIGN.md" }));
		expect(blobSpy).toHaveBeenCalledWith([canonical], {
			type: "text/markdown;charset=utf-8",
		});
	});
});
