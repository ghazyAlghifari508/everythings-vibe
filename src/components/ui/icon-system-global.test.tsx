// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import {
	Cancel01Icon,
	CheckmarkCircle02Icon,
	Copy01Icon,
	Loading01Icon,
	Settings01Icon,
	Tick01Icon,
	ViewIcon,
	ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./icon";

describe("TASK 10G: Global Zero-Lucide & Architecture Validation", () => {
	it("guarantees zero active lucide-react imports across the entire src/ tree", () => {
		const srcRoot = path.resolve(__dirname, "../..");
		const matchingFiles: string[] = [];

		function scanDir(dir: string) {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== "node_modules" && entry.name !== ".git") {
						scanDir(fullPath);
					}
				} else if (
					(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
					!fullPath.includes("tests") &&
					!fullPath.includes(".test.")
				) {
					const content = fs.readFileSync(fullPath, "utf-8");
					if (
						content.includes('from "lucide-react"') ||
						content.includes("from 'lucide-react'") ||
						content.includes('import("lucide-react")') ||
						content.includes("import('lucide-react')")
					) {
						matchingFiles.push(
							path.relative(srcRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(srcRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("guarantees no wildcard imports from @hugeicons exist in src/ to safeguard tree-shaking", () => {
		const srcRoot = path.resolve(__dirname, "../..");
		const wildcardFiles: string[] = [];

		function scanDir(dir: string) {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== "node_modules" && entry.name !== ".git") {
						scanDir(fullPath);
					}
				} else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
					const content = fs.readFileSync(fullPath, "utf-8");
					if (/import\s+\*\s+as\s+\w+\s+from\s+["']@hugeicons/i.test(content)) {
						wildcardFiles.push(
							path.relative(srcRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(srcRoot);
		expect(wildcardFiles).toEqual([]);
	});

	it("renders critical UI state transitions with Hugeicons and proper accessibility", () => {
		// 1. Password visibility toggle (View / ViewOff)
		const { container, rerender } = render(
			<button type="button" aria-label="Lihat password">
				<Icon icon={ViewIcon} size={16} />
			</button>,
		);

		let svg = container.querySelector("svg");
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute("width")).toBe("16");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");

		rerender(
			<button type="button" aria-label="Sembunyikan password">
				<Icon icon={ViewOffIcon} size={16} />
			</button>,
		);
		svg = container.querySelector("svg");
		expect(svg).toBeTruthy();

		// 2. Copy to clipboard feedback (Copy -> Tick)
		rerender(
			<button type="button" aria-label="Salin token">
				<Icon icon={Copy01Icon} size={14} />
			</button>,
		);
		expect(container.querySelector("svg")).toBeTruthy();

		rerender(
			<button type="button" aria-label="Tersalin">
				<Icon icon={Tick01Icon} size={14} color="#107c41" />
			</button>,
		);
		svg = container.querySelector("svg");
		expect(svg?.getAttribute("color")).toBe("#107c41");

		// 3. Loading spinner state
		rerender(
			<output aria-label="Memuat">
				<Icon icon={Loading01Icon} size={18} className="animate-spin" />
			</output>,
		);
		svg = container.querySelector("svg");
		expect(svg?.getAttribute("class")).toContain("animate-spin");

		// 4. Checklist completion state
		rerender(
			<div className="flex items-center gap-2">
				<span className="text-sm">Tugas 1</span>
				<Icon
					icon={CheckmarkCircle02Icon}
					size={16}
					className="text-emerald-500"
				/>
			</div>,
		);
		expect(container.querySelector("svg")).toBeTruthy();

		// 5. Standalone accessible icon (no aria-hidden when label provided)
		rerender(
			<Icon icon={Settings01Icon} size={20} aria-label="Pengaturan akun" />,
		);
		svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-label")).toBe("Pengaturan akun");
		expect(svg?.getAttribute("aria-hidden")).toBeNull();
	});

	it("supports interactive altIcon toggling for dual-state controls", () => {
		const { container, rerender } = render(
			<Icon
				icon={Tick01Icon}
				altIcon={Cancel01Icon}
				showAlt={false}
				data-testid="toggle-icon"
			/>,
		);

		let svg = container.querySelector("svg");
		const tickHtml = svg?.innerHTML;
		expect(tickHtml).toBeTruthy();

		rerender(
			<Icon
				icon={Tick01Icon}
				altIcon={Cancel01Icon}
				showAlt={true}
				data-testid="toggle-icon"
			/>,
		);
		svg = container.querySelector("svg");
		const cancelHtml = svg?.innerHTML;
		expect(cancelHtml).toBeTruthy();
		expect(tickHtml).not.toBe(cancelHtml);
	});
});
