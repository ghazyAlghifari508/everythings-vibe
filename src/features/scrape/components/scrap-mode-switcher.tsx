"use client";

import { Code, FileText, Images, Network } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { ScrapeMode } from "@/db/schema";
import { ScrapeWorkspaceForm } from "./scrape-workspace-form";

const modes: ScrapeMode[] = ["crawl", "design", "html", "images"];
const modeInfo = {
	crawl: {
		label: "Crawl Website",
		description:
			"Petakan halaman dan struktur website dari link yang ditemukan.",
		icon: Network,
	},
	design: {
		label: "Generate DESIGN.md",
		description: "Ambil design system sebagai panduan untuk AI coding.",
		icon: FileText,
	},
	html: {
		label: "Scrape HTML",
		description: "Simpan HTML hasil render dan lihat snapshot visual website.",
		icon: Code,
	},
	images: {
		label: "Scrape Images",
		description:
			"Temukan gambar, sumber aset, dan metadata dari halaman website.",
		icon: Images,
	},
};

export function ScrapModeSwitcher({
	initialMode = "design",
}: {
	initialMode?: ScrapeMode;
}) {
	const [mode, setMode] = useState<ScrapeMode>(initialMode);
	function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const current = modes.indexOf(mode);
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
		setMode(next);
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
					const Icon = modeInfo[value].icon;
					return (
						<button
							key={value}
							id={`${value}-tab`}
							type="button"
							role="tab"
							aria-selected={mode === value}
							aria-controls="extraction-panel"
							tabIndex={mode === value ? 0 : -1}
							onClick={() => setMode(value)}
							onKeyDown={onTabKeyDown}
							className={`inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-indigo ${mode === value ? "border-snow bg-snow text-obsidian" : "border-graphite text-fog hover:border-steel hover:text-snow"}`}
						>
							<Icon size={16} aria-hidden />
							{modeInfo[value].label}
						</button>
					);
				})}
			</div>
			<div
				id="extraction-panel"
				role="tabpanel"
				aria-labelledby={`${mode}-tab`}
				className="w-full"
			>
				<p className="mx-auto mb-6 max-w-2xl text-center text-sm leading-6 text-fog">
					{modeInfo[mode].description}
				</p>
				<ScrapeWorkspaceForm mode={mode} />
			</div>
		</div>
	);
}
