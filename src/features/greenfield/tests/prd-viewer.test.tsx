// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrdViewer } from "@/features/greenfield/components/prd/prd-viewer";

// Stub router hooks pulled in by shared UI helpers so the viewer renders in
// isolation; the version control itself only uses the installed DropdownMenu.
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
	Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/greenfield/hooks/use-panel-resize", () => ({
	usePanelResize: () => ({
		leftWidth: 260,
		onStartDragLeft: () => {},
		isDraggingLeft: false,
	}),
}));

let container: HTMLDivElement;
let root: Root | null = null;
let queryClient: QueryClient;

const VERSIONS = [
	{
		id: "v1",
		version: 1,
		content: "## 1. Ringkasan\n\nVersi pertama",
		change_summary: null,
		created_at: "2026-09-01T00:00:00.000Z",
	},
	{
		id: "v2",
		version: 2,
		content: "## 1. Ringkasan\n\nVersi kedua",
		change_summary: "Revisi",
		created_at: "2026-09-02T00:00:00.000Z",
	},
];

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	queryClient.clear();
});

function renderViewer(
	overrides: Partial<Parameters<typeof PrdViewer>[0]> = {},
) {
	act(() => {
		root?.render(
			<QueryClientProvider client={queryClient}>
				<PrdViewer
					content="## 1. Ringkasan\n\nVersi kedua"
					versions={VERSIONS}
					currentVersion={2}
					plan="pro"
					onSelectVersion={() => {}}
					{...overrides}
				/>
			</QueryClientProvider>,
		);
	});
}

function openVersionMenu() {
	const trigger = document.querySelector<HTMLButtonElement>(
		'button[aria-label^="Riwayat versi PRD"]',
	);
	if (!trigger) throw new Error("version control trigger missing");
	act(() => {
		fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
	});
	return trigger;
}

function clickMenuItem(label: string) {
	const item = [
		...document.querySelectorAll<HTMLElement>(
			'[role="menuitem"], [role="menuitemradio"]',
		),
	].find((candidate) => candidate.textContent?.includes(label));
	if (!item) throw new Error(`menu item '${label}' missing`);
	act(() => {
		fireEvent.click(item);
	});
}

describe("PrdViewer version control", () => {
	it("shows the document with no toolbar for 0/1 versions", () => {
		renderViewer({
			versions: [VERSIONS[0]],
			currentVersion: 1,
			content: VERSIONS[0]?.content ?? "",
		});

		expect(container.textContent).toContain("Versi pertama");
		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(
			container.querySelector('button[aria-label^="Riwayat versi PRD"]'),
		).toBeNull();
	});

	it("renders one control labelled with the active version, no preview tab", () => {
		renderViewer();

		const triggers = container.querySelectorAll(
			'button[aria-label^="Riwayat versi PRD"]',
		);
		expect(triggers).toHaveLength(1);
		expect(triggers[0]?.textContent).toContain("Versi 2");
		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(container.textContent).not.toContain("Pratinjau");
	});

	it("marks the selected version and the actual latest version", () => {
		renderViewer({
			currentVersion: 1,
			content: VERSIONS[0]?.content ?? "",
		});
		const trigger = openVersionMenu();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");

		const items = document.querySelectorAll('[role="menuitemradio"]');
		const checked = [...items].filter(
			(item) => item.getAttribute("aria-checked") === "true",
		);
		expect(items).toHaveLength(2);
		expect(checked).toHaveLength(1);
		expect(checked[0]?.textContent).toContain("Versi 1");

		const latest = [...items].filter((item) =>
			item.textContent?.includes("(Terbaru)"),
		);
		expect(latest).toHaveLength(1);
		expect(latest[0]?.textContent).toContain("Versi 2");
	});

	it("selects a persisted version without mutating it", () => {
		const onSelectVersion = vi.fn();
		renderViewer({ onSelectVersion });
		openVersionMenu();
		clickMenuItem("Versi 1");

		expect(onSelectVersion).toHaveBeenCalledWith(VERSIONS[0]?.content, 1);
	});

	it("opens compare from the same control with explicit old → new direction", () => {
		renderViewer();
		openVersionMenu();
		clickMenuItem("Bandingkan perubahan");

		expect(container.textContent).toContain("Versi 1 → Versi 2");
		expect(container.textContent).toContain("- Versi pertama");
		expect(container.textContent).toContain("+ Versi kedua");
		expect(
			container.querySelector('button[aria-label^="Riwayat versi PRD"]'),
		).toBeNull();
	});

	it("labels the earliest-version fallback as v1 → v2, not reversed", () => {
		renderViewer({
			currentVersion: 1,
			content: VERSIONS[0]?.content ?? "",
		});
		openVersionMenu();
		clickMenuItem("Bandingkan perubahan");

		expect(container.textContent).toContain("Versi 1 → Versi 2");
		expect(container.textContent).toContain("+ Versi kedua");
	});

	it("uses real version numbers for non-contiguous history", () => {
		const versions = [
			VERSIONS[0],
			{
				...VERSIONS[1],
				id: "v3",
				version: 3,
				content: "## 1. Ringkasan\n\nVersi ketiga",
			},
		];
		renderViewer({ versions, currentVersion: 3, content: "Versi ketiga" });
		openVersionMenu();
		clickMenuItem("Bandingkan perubahan");

		expect(container.textContent).toContain("Versi 1 → Versi 3");
	});

	it("returns focus to the control after leaving compare mode", () => {
		renderViewer();
		openVersionMenu();
		clickMenuItem("Bandingkan perubahan");
		const back = [
			...container.querySelectorAll<HTMLButtonElement>("button"),
		].find((button) => button.textContent?.includes("Kembali ke dokumen"));
		if (!back) throw new Error("back action missing");

		act(() => {
			fireEvent.click(back);
		});

		expect(container.textContent).toContain("Versi kedua");
		const currentTrigger = document.querySelector<HTMLButtonElement>(
			'button[aria-label^="Riwayat versi PRD"]',
		);
		expect(document.activeElement).toBe(currentTrigger);
	});

	it("closes compare on Escape and restores the document", () => {
		renderViewer();
		openVersionMenu();
		clickMenuItem("Bandingkan perubahan");
		act(() => {
			fireEvent.keyDown(document, { key: "Escape" });
		});

		expect(container.textContent).toContain("Versi kedua");
		expect(container.textContent).not.toContain("Versi 1 → Versi 2");
	});

	it("keeps the plan gate without disclosing version records", () => {
		renderViewer({ plan: "free" });
		openVersionMenu();

		expect(document.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0);
		expect(document.body.textContent).toContain(
			"Upgrade ke Pro untuk melihat history revisi",
		);
	});

	it("disables version actions while generation is active", () => {
		renderViewer({ isGenerating: true });
		const trigger = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Riwayat versi PRD"]',
		);
		expect(trigger?.disabled).toBe(true);
	});

	it("leaves compare mode when a revision starts streaming", () => {
		renderViewer();
		openVersionMenu();
		clickMenuItem("Bandingkan perubahan");
		expect(container.textContent).toContain("Versi 1 → Versi 2");

		renderViewer({ isGenerating: true, content: "## 1. Ringkasan\n\nLive" });

		expect(container.textContent).not.toContain("Versi 1 → Versi 2");
		expect(container.textContent).toContain("Live");
	});
});

describe("PrdViewer pre-token canvas", () => {
	const skeleton = () =>
		container.querySelector('[data-testid="prd-skeleton"]');

	it("shows a text skeleton instead of an empty document while generating", () => {
		renderViewer({ content: "", versions: [], isGenerating: true });

		expect(skeleton()).not.toBeNull();
		// Placeholder only: no copy is rendered into the canvas.
		expect(skeleton()?.textContent).toBe("");
		expect(skeleton()?.getAttribute("aria-label")).toBe("Menyusun PRD");
	});

	it("replaces the skeleton with the live document on the first token", () => {
		renderViewer({ content: "", versions: [], isGenerating: true });
		renderViewer({
			content: "## 1. Ringkasan\n\nToken pertama",
			versions: [],
			isGenerating: true,
		});

		expect(skeleton()).toBeNull();
		expect(container.textContent).toContain("Token pertama");
	});

	it("never covers a saved document with the skeleton", () => {
		renderViewer({
			content: "## 1. Ringkasan\n\nTersimpan",
			versions: [],
			isGenerating: true,
		});

		expect(skeleton()).toBeNull();
		expect(container.textContent).toContain("Tersimpan");
	});
});

describe("Export PDF removal", () => {
	// Vite rewrites import.meta.url to a `/@fs/` URL, so derive the repo root
	// from process.cwd() (vitest runs at the repo root) instead.
	const repoRoot = `${process.cwd()}/`;

	it("keeps no reference to the PDF export feature anywhere in src", async () => {
		// The feature was removed end to end: route, service, util, constants,
		// dependency, and UI. Guard against a partial reintroduction by scanning
		// the source tree directly, without depending on an external git binary.
		const { readdirSync, readFileSync } = await import("node:fs");
		const { join } = await import("node:path");

		const offenders: string[] = [];
		// Paths are compared with forward slashes so the exclusions hold on
		// Windows and POSIX alike.
		const allowlist = new Set([
			// Pinned upstream documents mention PDF as design guidance, not an app export feature.
			"src/features/templates/data/gallery-templates.ts",
			"src/features/templates/data/vibe-templates.ts",
			"src/features/studio/tests/studio-launch-composer.test.tsx",
			"src/features/studio/tests/studio-prd-validation.test.ts",
			"src/features/studio/services/studio-prd-helpers.ts",
			"src/features/studio/services/studio-prd-validation.server.ts",
			"src/features/studio/tests/studio-generate-route.test.ts",
			"src/features/greenfield/tests/ask-restore.test.ts",
			"src/features/greenfield/tests/prd-viewer.test.tsx",
			"src/features/greenfield/prompts/ask.ts",
		]);
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(full);
					continue;
				}
				if (!/\.(ts|tsx)$/.test(entry.name)) continue;
				const rel = full.slice(repoRoot.length).split(/[\\/]/).join("/");
				// This test names the feature on purpose; the prompt templates are
				// example product ideas a user may pick, not a PrdFy export feature.
				if (allowlist.has(rel)) continue;
				const text = readFileSync(full, "utf8");
				if (/pdf/i.test(text)) offenders.push(rel);
			}
		};
		walk(join(repoRoot, "src"));
		expect(offenders).toEqual([]);
	});

	it("no longer declares the jspdf dependency", async () => {
		const pkg = JSON.parse(
			await readFile(`${repoRoot}package.json`, "utf8"),
		) as { dependencies?: Record<string, string> };
		expect(pkg.dependencies?.jspdf).toBeUndefined();
	});
});
