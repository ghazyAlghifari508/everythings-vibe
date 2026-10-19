import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	Alert02Icon,
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	BotIcon,
	Cancel01Icon,
	CodeIcon,
	Copy01Icon,
	Delete02Icon,
	Download01Icon,
	Globe02Icon,
	Image01Icon,
	InformationCircleIcon,
	LinkSquare01Icon,
	Loading03Icon,
	Maximize01Icon,
	Minimize01Icon,
	RefreshIcon,
	ScanIcon,
	Search01Icon,
	SlidersHorizontalIcon,
	SparklesIcon,
	Tick01Icon,
	ViewIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10E: Scrape icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/scrape/", () => {
		const scrapeRoot = path.resolve(__dirname, "..");
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
							path.relative(scrapeRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(scrapeRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders Scrape form, modes, and notice icons correctly with accessible attributes", () => {
		const { container } = render(
			<div>
				<Icon icon={Globe02Icon} size={16} />
				<Icon icon={SparklesIcon} size={14} />
				<Icon icon={Search01Icon} size={16} />
				<Icon icon={ArrowDown01Icon} size={14} />
				<Icon icon={InformationCircleIcon} size={16} />
				<Icon icon={SlidersHorizontalIcon} size={14} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(6);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders Scrape progress, status, and preview icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={Loading03Icon} size={16} className="animate-spin" />
				<Icon icon={Alert02Icon} size={16} />
				<Icon icon={Tick01Icon} size={16} />
				<Icon icon={ViewIcon} size={16} />
				<Icon icon={RefreshIcon} size={14} />
				<Icon icon={Maximize01Icon} size={16} />
				<Icon icon={Minimize01Icon} size={16} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(7);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders Scrape history, toolbar, and inspector icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={ArrowLeft01Icon} size={16} />
				<Icon icon={ArrowRight01Icon} size={16} />
				<Icon icon={Delete02Icon} size={14} />
				<Icon icon={Copy01Icon} size={15} />
				<Icon icon={Download01Icon} size={15} />
				<Icon icon={CodeIcon} size={16} />
				<Icon icon={Image01Icon} size={15} />
				<Icon icon={ScanIcon} size={14} />
				<Icon icon={LinkSquare01Icon} size={16} />
				<Icon icon={BotIcon} size={14} />
				<Icon icon={Cancel01Icon} size={15} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(11);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});
});
