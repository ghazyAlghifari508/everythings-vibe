// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncPromptPayload } from "@/lib/codebase-sync";
import { ScreenConnect } from "./screen-connect";

const samplePayload: SyncPromptPayload = {
	projectId: "proj_123",
	apiBaseUrl: "https://prdfy.example.com",
	syncToken: "tok_123",
	cliMinVersion: "2.0.0",
	syncCommand: "prdfy codebase sync",
	expiresAt: new Date(Date.now() + 60000).toISOString(),
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
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
	vi.unstubAllGlobals();
});

describe("ScreenConnect", () => {
	it("copies prompt successfully and shows 'Tersalin'", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText },
		});

		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const copyBtn = [...container.querySelectorAll("button")].find((b) =>
			/salin/i.test(b.textContent ?? ""),
		);
		expect(copyBtn).toBeDefined();

		await act(async () => {
			copyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(writeText).toHaveBeenCalledTimes(1);
		expect(container.textContent).toContain("Tersalin");
	});

	it("shows fallback error message when clipboard fails", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText },
		});

		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const copyBtn = [...container.querySelectorAll("button")].find((b) =>
			/salin/i.test(b.textContent ?? ""),
		);

		await act(async () => {
			copyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("Gagal menyalin otomatis");
	});

	it("renders the self-contained execution prompt with session details", () => {
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const rendered = container.textContent ?? "";
		expect(rendered).toContain("Sinkronkan codebase repositori lokal ini");
		expect(rendered).toContain("proj_123");
		expect(rendered).toContain(
			"vibeeverything codebase sync --project-id proj_123",
		);
		// The required sections are all present.
		expect(rendered).toContain("## Informasi Sinkronisasi");
		expect(rendered).toContain("## Prasyarat Eksekusi");
		expect(rendered).toContain("## Perintah Yang Harus Dieksekusi");
		expect(rendered).toContain("## Yang Dilakukan CLI Otomatis");
		expect(rendered).toContain("## Aturan Yang Wajib Dipatuhi");
		expect(rendered).toContain("## Penanganan Kegagalan");
		expect(rendered).toContain("## Format Laporan Akhir");
		// No robotic step scaffolding and no version gate in the prompt.
		expect(rendered).not.toMatch(/Langkah \d/);
		expect(rendered).not.toContain("2.0.0");
	});

	it("copies the new prompt including the credential", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText },
		});

		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const copyBtn = [...container.querySelectorAll("button")].find((b) =>
			/salin/i.test(b.textContent ?? ""),
		);
		await act(async () => {
			copyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const copied = String(writeText.mock.calls[0]?.[0] ?? "");
		expect(copied).toContain("tok_123");
		expect(copied).toContain("Sinkronkan codebase repositori lokal ini");
		expect(copied).toContain(
			"vibeeverything codebase sync --project-id proj_123",
		);
		// The clipboard payload is the complete execution document.
		expect(copied).toContain("## Format Laporan Akhir");
		expect(copied).toContain("## Penanganan Kegagalan");
	});

	it("renders the AI coding agent / harness logos in Step 2", () => {
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const harnessContainer = container.querySelector(
			'[data-testid="ai-harness-logos"]',
		);
		expect(harnessContainer).not.toBeNull();
		const harnessText = harnessContainer?.textContent ?? "";
		expect(harnessText).toContain("Codex");
		expect(harnessText).toContain("Claude Code");
		expect(harnessText).toContain("OpenCode");
		expect(harnessText).toContain("Antigravity");
		expect(harnessText).toContain("Pi");
		expect(harnessText).toContain("Cursor");

		// Confirm each harness renders an SVG icon
		const svgs = harnessContainer?.querySelectorAll("svg");
		expect(svgs?.length).toBe(6);
	});

	it("instructs agent to verify and install Node.js/npm in execution prerequisites", () => {
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const rendered = container.textContent ?? "";
		expect(rendered).toContain("Node.js dan npm");
		expect(rendered).toContain("https://nodejs.org");
	});

	it("shows neutral copy instead of the provisional creation name", () => {
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Repository Lokal"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const rendered = container.textContent ?? "";
		expect(rendered).toContain("Repository belum terdeteksi");
		expect(rendered).not.toContain("Nama Fitur");
		expect(rendered).not.toContain("Repository Lokal");
	});

	it("shows the detected repository name once the CLI has reported it", () => {
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="react-movie-app"
					payload={samplePayload}
					status={null}
				/>,
			);
		});

		const rendered = container.textContent ?? "";
		expect(rendered).toContain("Project / react-movie-app");
		expect(rendered).toContain("react-movie-app");
	});
});
