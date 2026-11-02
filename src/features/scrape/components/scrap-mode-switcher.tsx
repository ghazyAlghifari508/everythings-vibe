"use client";

import {
	ChartNetworkIcon,
	CodeIcon,
	File01Icon,
	Image01Icon,
} from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ScrapeMode } from "@/db/schema";
import { saveRememberedScrapeMode } from "../utils/scrape-mode-session";
import { ScrapeWorkspaceForm } from "./scrape-workspace-form";

const modes: ScrapeMode[] = ["crawl", "design", "html", "images"];
const modeInfo = {
	crawl: {
		label: "Crawl Website",
		description:
			"Petakan halaman dan struktur website dari link yang ditemukan.",
		icon: ChartNetworkIcon,
	},
	design: {
		label: "Generate DESIGN.md",
		description: "Ambil design system sebagai panduan untuk AI coding.",
		icon: File01Icon,
	},
	html: {
		label: "Scrape HTML",
		description: "Simpan HTML hasil render dan lihat snapshot visual website.",
		icon: CodeIcon,
	},
	images: {
		label: "Scrape Images",
		description:
			"Temukan gambar, sumber aset, dan metadata dari halaman website.",
		icon: Image01Icon,
	},
};

export interface ScrapModeSwitcherProps {
	initialMode?: ScrapeMode;
	mode?: ScrapeMode;
	onModeChange?: (mode: ScrapeMode) => void;
}

export function ScrapModeSwitcher({
	initialMode = "design",
	mode: controlledMode,
	onModeChange,
}: ScrapModeSwitcherProps = {}) {
	const navigate = useNavigate();
	const [localMode, setLocalMode] = useState<ScrapeMode>(
		controlledMode ?? initialMode,
	);
	const [prevPropMode, setPrevPropMode] = useState<ScrapeMode>(
		controlledMode ?? initialMode,
	);

	const propMode = controlledMode ?? initialMode;
	if (propMode !== prevPropMode) {
		setPrevPropMode(propMode);
		setLocalMode(propMode);
	}

	const activeMode = controlledMode ?? localMode;

	function selectMode(next: ScrapeMode) {
		if (next === activeMode) return;
		setLocalMode(next);
		saveRememberedScrapeMode(next);
		onModeChange?.(next);
		try {
			void navigate({
				to: "/scrape",
				search: { mode: next },
			});
		} catch {
			// ponytail: outside Router context in tests, navigate may be mocked or throw.
		}
	}

	function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const current = modes.indexOf(activeMode);
		const next =
			event.key === "ArrowRight"
				? modes[(current + 1) % modes.length]
				: event.key === "ArrowLeft"
					? modes[(current - 1 + modes.length) % modes.length]
					: event.key === "Home"
						? modes[0]
						: event.key === "End"
							? modes[modes.length - 1]
							: null;
		if (!next) return;
		event.preventDefault();
		selectMode(next);
		requestAnimationFrame(() =>
			document.getElementById(`${next}-tab`)?.focus(),
		);
	}
	return (
		<div className="flex w-full flex-col items-center">
			<div
				role="tablist"
				aria-label="Pilih mode"
				className="mb-7 flex w-full max-w-3xl gap-2 overflow-x-auto py-1"
			>
				{modes.map((value) => {
					const icon = modeInfo[value].icon;
					return (
						<button
							key={value}
							id={`${value}-tab`}
							type="button"
							role="tab"
							aria-selected={activeMode === value}
							aria-controls="extraction-panel"
							tabIndex={activeMode === value ? 0 : -1}
							onClick={() => selectMode(value)}
							onKeyDown={onTabKeyDown}
							className={`inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-indigo ${activeMode === value ? "border-snow bg-snow text-obsidian" : "border-graphite text-fog hover:border-steel hover:text-snow"}`}
						>
							<Icon icon={icon} size={16} aria-hidden />
							{modeInfo[value].label}
						</button>
					);
				})}
			</div>
			<div
				id="extraction-panel"
				role="tabpanel"
				aria-labelledby={`${activeMode}-tab`}
				className="w-full"
			>
				<p className="mx-auto mb-6 max-w-2xl text-center text-sm leading-6 text-fog">
					{modeInfo[activeMode].description}
				</p>
				<ScrapeWorkspaceForm mode={activeMode} />
			</div>
		</div>
	);
}
