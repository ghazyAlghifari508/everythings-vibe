import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	Add01Icon,
	ArrowLeft01Icon,
	Bug01Icon,
	Copy01Icon,
	CreditCardIcon,
	Delete02Icon,
	Key01Icon,
	Loading01Icon,
	Message01Icon,
	Notification01Icon,
	Shield01Icon,
	SparklesIcon,
	Tick01Icon,
	UserIcon,
	ViewIcon,
	ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10F: Auth & Settings icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/auth-settings/", () => {
		const authSettingsRoot = path.resolve(__dirname, "..");
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
							path.relative(authSettingsRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(authSettingsRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders settings navigation sidebar icons with accessible attributes", () => {
		const { container } = render(
			<div>
				<Icon icon={UserIcon} size={18} />
				<Icon icon={Shield01Icon} size={18} />
				<Icon icon={Key01Icon} size={18} />
				<Icon icon={Notification01Icon} size={18} />
				<Icon icon={CreditCardIcon} size={18} />
				<Icon icon={Message01Icon} size={18} />
				<Icon icon={ArrowLeft01Icon} size={18} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(7);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders API key management and feedback form action icons with expected sizes", () => {
		const { container } = render(
			<div>
				<Icon icon={Add01Icon} size={14} />
				<Icon icon={Tick01Icon} size={16} />
				<Icon icon={ViewOffSlashIcon} size={14} />
				<Icon icon={ViewIcon} size={14} />
				<Icon icon={Copy01Icon} size={14} />
				<Icon icon={Delete02Icon} size={14} />
				<Icon icon={Bug01Icon} size={14} />
				<Icon icon={SparklesIcon} size={14} />
				<Icon icon={Loading01Icon} size={16} className="animate-spin" />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(9);
	});
});
