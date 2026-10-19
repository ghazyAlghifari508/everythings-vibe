import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	ArrowRight01Icon,
	BarChartIcon,
	BotIcon,
	Building01Icon,
	Copy01Icon,
	CreditCardIcon,
	DashboardSquare01Icon,
	GraduationCapIcon,
	HeartPulseIcon,
	Invoice01Icon,
	Layers01Icon,
	Search01Icon,
	ShoppingBag01Icon,
	ShoppingCart01Icon,
	SmartPhone01Icon,
	SparklesIcon,
	Store01Icon,
	TerminalIcon,
	Tick01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10F: Templates domain icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/templates/", () => {
		const templatesRoot = path.resolve(__dirname, "..");
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
							path.relative(templatesRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(templatesRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders all template catalog category, card, and action icons with valid SVGs", () => {
		const { container } = render(
			<div>
				<Icon icon={BarChartIcon} size={20} />
				<Icon icon={Store01Icon} size={20} />
				<Icon icon={SmartPhone01Icon} size={20} />
				<Icon icon={GraduationCapIcon} size={20} />
				<Icon icon={UserGroupIcon} size={20} />
				<Icon icon={Invoice01Icon} size={20} />
				<Icon icon={DashboardSquare01Icon} size={20} />
				<Icon icon={HeartPulseIcon} size={20} />
				<Icon icon={ShoppingBag01Icon} size={20} />
				<Icon icon={CreditCardIcon} size={20} />
				<Icon icon={TerminalIcon} size={20} />
				<Icon icon={SparklesIcon} size={20} />
				<Icon icon={Building01Icon} size={20} />
				<Icon icon={Layers01Icon} size={20} />
				<Icon icon={ShoppingCart01Icon} size={20} />
				<Icon icon={BotIcon} size={20} />
				<Icon icon={Search01Icon} size={16} />
				<Icon icon={ArrowRight01Icon} size={14} />
				<Icon icon={Copy01Icon} size={14} />
				<Icon icon={Tick01Icon} size={14} />
			</div>,
		);

		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(20);
		for (const svg of svgs) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});
});
