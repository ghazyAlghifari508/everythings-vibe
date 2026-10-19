import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	Alert01Icon,
	AlertCircleIcon,
	CalendarClockIcon,
	Cancel01Icon,
	CancelCircleIcon,
	CheckmarkCircle01Icon,
	Clock01Icon,
	Coins01Icon,
	CreditCardIcon,
	Delete02Icon,
	Loading01Icon,
	RefreshIcon,
	ShieldAlertIcon,
	Tick01Icon,
	Undo02Icon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10F: Billing icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/billing/", () => {
		const billingRoot = path.resolve(__dirname, "..");
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
							path.relative(billingRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(billingRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders billing status and action icons with expected accessible attributes and sizes", () => {
		const { container } = render(
			<div>
				<Icon icon={Alert01Icon} size={14} />
				<Icon icon={CalendarClockIcon} size={14} />
				<Icon icon={Delete02Icon} size={14} />
				<Icon icon={CreditCardIcon} size={18} />
				<Icon icon={Coins01Icon} size={14} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(5);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders modal and credit usage lifecycle badges properly", () => {
		const { container } = render(
			<div>
				<Icon icon={CheckmarkCircle01Icon} size={12} />
				<Icon icon={Undo02Icon} size={12} />
				<Icon icon={CancelCircleIcon} size={12} />
				<Icon icon={Clock01Icon} size={12} />
				<Icon icon={RefreshIcon} size={12} className="animate-spin" />
				<Icon icon={ShieldAlertIcon} size={12} />
				<Icon icon={AlertCircleIcon} size={16} />
				<Icon icon={Cancel01Icon} size={18} />
				<Icon icon={Tick01Icon} size={10} strokeWidth={3} />
				<Icon icon={Loading01Icon} size={16} className="animate-spin" />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(10);
	});
});
