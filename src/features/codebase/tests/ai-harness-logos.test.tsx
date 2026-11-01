// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AiHarnessLogos,
	AntigravityIcon,
	HARNESS_ITEMS,
} from "../components/workspace/ai-harness-logos";
import { AntigravityIcon as DirectAntigravityIcon } from "../components/workspace/antigravity-icon";

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
});

describe("AiHarnessLogos and AntigravityIcon", () => {
	it("renders all 6 supported AI coding agents with accessible labels", () => {
		act(() => {
			root?.render(<AiHarnessLogos />);
		});

		const section = container.querySelector('[data-testid="ai-harness-logos"]');
		expect(section).not.toBeNull();
		expect(section?.getAttribute("aria-label")).toBe(
			"Daftar AI Coding Agent yang Didukung",
		);

		const expectedHarnesses = [
			"Codex",
			"Claude Code",
			"OpenCode",
			"Antigravity",
			"Pi",
			"Cursor",
		];
		expect(HARNESS_ITEMS.map((h) => h.name)).toEqual(expectedHarnesses);

		for (const name of expectedHarnesses) {
			const slug = name.toLowerCase().replace(/\s+/g, "-");
			const itemEl = container.querySelector(
				`[data-testid="ai-harness-${slug}"]`,
			);
			expect(itemEl).not.toBeNull();
			expect(itemEl?.getAttribute("title")).toContain(name);
			expect(itemEl?.getAttribute("title")).toContain("Buka di terminal");
		}
	});

	it("uses official Google Antigravity asset without inaccurate custom gradient", () => {
		act(() => {
			root?.render(<AntigravityIcon />);
		});

		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute("viewBox")).toBe("0 0 180 180");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");

		// Must NOT use deprecated custom linearGradient ID
		expect(container.querySelector("#antigravity-grad")).toBeNull();

		// Must use official base path and blue fill (#3186FF)
		const mainPath = svg?.querySelector('path[fill="#3186FF"]');
		expect(mainPath).not.toBeNull();
		expect(mainPath?.getAttribute("d")).toContain("M144.248 149.062");

		// Must contain official mask and defs filters
		const mask = svg?.querySelector("mask");
		expect(mask).not.toBeNull();
		const filters = svg?.querySelectorAll("filter");
		expect(filters?.length).toBe(11);
	});

	it("prevents SVG ID collisions across multiple instances", () => {
		act(() => {
			root?.render(
				<div>
					<div id="first-instance">
						<AntigravityIcon />
					</div>
					<div id="second-instance">
						<DirectAntigravityIcon />
					</div>
				</div>,
			);
		});

		const firstSvg = container.querySelector("#first-instance svg");
		const secondSvg = container.querySelector("#second-instance svg");
		expect(firstSvg).not.toBeNull();
		expect(secondSvg).not.toBeNull();

		const firstMaskId = firstSvg?.querySelector("mask")?.getAttribute("id");
		const secondMaskId = secondSvg?.querySelector("mask")?.getAttribute("id");
		expect(firstMaskId).toBeDefined();
		expect(secondMaskId).toBeDefined();
		expect(firstMaskId).not.toBe(secondMaskId);

		const firstFilterIds = [
			...(firstSvg?.querySelectorAll("filter") ?? []),
		].map((f) => f.getAttribute("id"));
		const secondFilterIds = [
			...(secondSvg?.querySelectorAll("filter") ?? []),
		].map((f) => f.getAttribute("id"));

		expect(firstFilterIds.length).toBe(11);
		expect(secondFilterIds.length).toBe(11);
		const intersection = firstFilterIds.filter((id) =>
			secondFilterIds.includes(id),
		);
		expect(intersection).toHaveLength(0);
	});

	it("keeps other harness icons and badge styling consistent", () => {
		const antigravityItem = HARNESS_ITEMS.find((h) => h.name === "Antigravity");
		expect(antigravityItem).toBeDefined();
		expect(antigravityItem?.brand).toBe("Google");
		expect(antigravityItem?.badgeBg).toBe("bg-white text-black");
		expect(antigravityItem?.badgeBorder).toBe("border-iron/80");

		const codexItem = HARNESS_ITEMS.find((h) => h.name === "Codex");
		expect(codexItem?.brand).toBe("OpenAI");
		expect(codexItem?.badgeBg).toBe("bg-white text-black");

		const claudeItem = HARNESS_ITEMS.find((h) => h.name === "Claude Code");
		expect(claudeItem?.brand).toBe("Anthropic");
		expect(claudeItem?.badgeBg).toBe("bg-[#D97757] text-white");
	});
});
