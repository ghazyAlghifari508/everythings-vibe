import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	ArrowLeft01Icon,
	Cancel01Icon,
	ComputerIcon,
	Delete02Icon,
	Download01Icon,
	Loading01Icon,
	Menu01Icon,
	PaintBoardIcon,
	PlusSignIcon,
	Search01Icon,
	SmartPhone01Icon,
	SparklesIcon,
	Tick01Icon,
	Upload01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10E: Studio icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/studio/", () => {
		const studioRoot = path.resolve(__dirname, "..");
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
							path.relative(studioRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(studioRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders Studio composer and shortcut icons correctly with accessible attributes", () => {
		const { container } = render(
			<div>
				<Icon icon={SparklesIcon} size={16} />
				<Icon icon={PaintBoardIcon} size={14} />
				<Icon icon={Upload01Icon} size={14} />
				<Icon icon={Tick01Icon} size={12} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(4);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders Studio workspace navigation and canvas control icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={Menu01Icon} size={18} />
				<Icon icon={ArrowLeft01Icon} size={16} />
				<Icon icon={PlusSignIcon} size={16} />
				<Icon icon={Download01Icon} size={16} />
				<Icon icon={UserIcon} size={18} />
				<Icon
					icon={Loading01Icon}
					size={16}
					className="motion-safe:animate-spin"
				/>
				<Icon icon={Delete02Icon} size={16} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(7);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders Studio sidebar device and utility icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={Search01Icon} size={14} />
				<Icon icon={Cancel01Icon} size={13} />
				<Icon icon={SmartPhone01Icon} size={13} />
				<Icon icon={ComputerIcon} size={13} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(4);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});
});
