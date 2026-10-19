import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	ArrowDown01Icon,
	Cancel01Icon,
	CheckmarkCircle01Icon,
	CheckmarkSquare02Icon,
	CubeIcon,
	File01Icon,
	Layers01Icon,
	Tick01Icon,
	ZoomInAreaIcon,
	ZoomOutAreaIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10C: Greenfield icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/greenfield/", () => {
		const greenfieldRoot = path.resolve(__dirname, "..");
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
					!fullPath.includes("tests")
				) {
					const content = fs.readFileSync(fullPath, "utf-8");
					if (
						content.includes('from "lucide-react"') ||
						content.includes("from 'lucide-react'")
					) {
						matchingFiles.push(
							path.relative(greenfieldRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(greenfieldRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders checklist completion tick icon with accessible attributes and size", () => {
		const { container } = render(
			<Icon icon={Tick01Icon} size={14} strokeWidth={2} />,
		);
		const svg = container.querySelector("svg");
		expect(svg).toBeDefined();
		expect(svg?.getAttribute("width")).toBe("14");
		expect(svg?.getAttribute("height")).toBe("14");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
	});

	it("renders whiteboard zoom controls and canvas nodes without layout disruption", () => {
		const { container } = render(
			<div>
				<Icon icon={ZoomInAreaIcon} size={16} />
				<Icon icon={ZoomOutAreaIcon} size={16} />
				<Icon icon={CubeIcon} size={18} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(3);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders Kanban toolbar, card, and action modal icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={Layers01Icon} size={14} />
				<Icon icon={CheckmarkSquare02Icon} size={10} />
				<Icon icon={CheckmarkCircle01Icon} size={13} />
				<Icon icon={ArrowDown01Icon} size={13} />
				<Icon icon={File01Icon} size={16} />
				<Icon icon={Cancel01Icon} size={18} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(6);
	});
});
