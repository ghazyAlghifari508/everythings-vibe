import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	ArrowLeft01Icon,
	ArrowUpRight01Icon,
	BubbleChatIcon,
	Cancel01Icon,
	CheckmarkCircle02Icon,
	Clock01Icon,
	CreditCardIcon,
	CrownIcon,
	DashboardSquare01Icon,
	File02Icon,
	GitBranchIcon,
	InboxIcon,
	Layers01Icon,
	LinkSquare02Icon,
	Search01Icon,
	Settings02Icon,
	Shield01Icon,
	ShieldCheckIcon,
	SparklesIcon,
	TradeUpIcon,
	UserCheck01Icon,
	UserGroupIcon,
	ViewIcon,
	ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10F: Admin domain icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/admin/", () => {
		const adminRoot = path.resolve(__dirname, "..");
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
							path.relative(adminRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(adminRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders all admin navigation and shell icons with valid SVGs", () => {
		const { container } = render(
			<div>
				<Icon icon={DashboardSquare01Icon} size={14} />
				<Icon icon={UserGroupIcon} size={14} />
				<Icon icon={BubbleChatIcon} size={14} />
				<Icon icon={GitBranchIcon} size={14} />
				<Icon icon={CreditCardIcon} size={14} />
				<Icon icon={Settings02Icon} size={14} />
				<Icon icon={ViewIcon} size={14} />
				<Icon icon={ViewOffIcon} size={14} />
			</div>,
		);

		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(8);
		for (const svg of svgs) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders all metric card, table badge, and action icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={ArrowLeft01Icon} size={14} />
				<Icon icon={ArrowUpRight01Icon} size={16} />
				<Icon icon={Layers01Icon} size={16} />
				<Icon icon={CrownIcon} size={16} />
				<Icon icon={UserCheck01Icon} size={16} />
				<Icon icon={Shield01Icon} size={16} />
				<Icon icon={ShieldCheckIcon} size={16} />
				<Icon icon={Cancel01Icon} size={10} />
				<Icon icon={CheckmarkCircle02Icon} size={16} />
				<Icon icon={Clock01Icon} size={16} />
				<Icon icon={File02Icon} size={16} />
				<Icon icon={LinkSquare02Icon} size={12} />
				<Icon icon={InboxIcon} size={18} />
				<Icon icon={SparklesIcon} size={10} />
				<Icon icon={TradeUpIcon} size={16} />
				<Icon icon={Search01Icon} size={15} />
			</div>,
		);

		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(16);
		for (const svg of svgs) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});
});
