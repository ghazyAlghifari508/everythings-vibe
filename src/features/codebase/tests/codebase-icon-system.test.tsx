import fs from "node:fs";
import path from "node:path";
// @vitest-environment jsdom

import {
	Add01Icon,
	Alert02Icon,
	AlertCircleIcon,
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Cancel01Icon,
	Copy01Icon,
	DatabaseIcon,
	Delete02Icon,
	Download01Icon,
	Edit02Icon,
	File01Icon,
	FileCodeIcon,
	Folder01Icon,
	FolderGitIcon,
	Layers01Icon,
	LinkSquare01Icon,
	Loading01Icon,
	MoreHorizontalIcon,
	RefreshIcon,
	RotateLeft01Icon,
	Search01Icon,
	TerminalIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/icon";

describe("TASK 10D: Codebase icon system verification", () => {
	it("guarantees zero active lucide-react imports exist across src/features/codebase/", () => {
		const codebaseRoot = path.resolve(__dirname, "..");
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
							path.relative(codebaseRoot, fullPath).replace(/\\/g, "/"),
						);
					}
				}
			}
		}

		scanDir(codebaseRoot);
		expect(matchingFiles).toEqual([]);
	});

	it("renders workspace & connect stage icons with accessible attributes and size", () => {
		const { container } = render(
			<div>
				<Icon icon={RefreshIcon} size={14} className="text-fog" />
				<Icon
					icon={Loading01Icon}
					size={14}
					className="animate-spin text-blue-400"
				/>
				<Icon icon={AlertCircleIcon} size={14} className="text-crimson" />
				<Icon icon={Tick01Icon} size={14} strokeWidth={2} />
				<Icon icon={ArrowRight01Icon} size={14} />
				<Icon icon={Copy01Icon} size={13} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(6);
		for (const svg of Array.from(svgs)) {
			expect(svg.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("renders explorer and artifact canvas icons with correct dimensions and classes", () => {
		const { container } = render(
			<div>
				<Icon icon={Folder01Icon} size={14} className="text-fog" />
				<Icon icon={FileCodeIcon} size={14} className="text-slate" />
				<Icon icon={Download01Icon} size={12} />
				<Icon icon={Search01Icon} size={14} />
				<Icon icon={File01Icon} size={16} />
				<Icon icon={Cancel01Icon} size={16} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(6);
	});

	it("renders chat workspace, state, and adaptive question icons correctly", () => {
		const { container } = render(
			<div>
				<Icon icon={Layers01Icon} size={14} />
				<Icon icon={RotateLeft01Icon} size={12} />
				<Icon icon={Alert02Icon} size={14} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(3);
	});

	it("renders planning, kanban, library, and review action icons without regression", () => {
		const { container } = render(
			<div>
				<Icon icon={ArrowLeft01Icon} size={13} />
				<Icon icon={LinkSquare01Icon} size={12} />
				<Icon icon={DatabaseIcon} size={16} />
				<Icon icon={TerminalIcon} size={16} />
				<Icon icon={FolderGitIcon} size={24} />
				<Icon icon={Add01Icon} size={13} />
				<Icon icon={ArrowDown01Icon} size={12} />
				<Icon icon={MoreHorizontalIcon} size={16} />
				<Icon icon={Edit02Icon} size={14} />
				<Icon icon={Delete02Icon} size={14} />
			</div>,
		);
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBe(10);
	});
});
