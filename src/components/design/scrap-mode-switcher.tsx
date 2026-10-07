"use client";

import { Code, FileText } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { ScrapeMode } from "@/db/schema";
import { DesignGeneratorPanel } from "./design-generator-panel";
import { HtmlScraperPanel } from "./html-scraper-panel";

export function ScrapModeSwitcher() {
	const [mode, setMode] = useState<ScrapeMode>("design");

	function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
		const modes: ScrapeMode[] = ["design", "html"];
		const current = modes.indexOf(mode);
		const next =
			e.key === "ArrowRight"
				? modes[(current + 1) % modes.length]
				: e.key === "ArrowLeft"
					? modes[(current - 1 + modes.length) % modes.length]
					: e.key === "Home"
						? modes[0]
						: e.key === "End"
							? modes[modes.length - 1]
							: null;

		if (!next) return;
		e.preventDefault();
		setMode(next);
		requestAnimationFrame(() => {
			document.getElementById(`${next}-tab`)?.focus();
		});
	}

	return (
		<div className="flex w-full flex-col items-center">
			<div
				role="tablist"
				aria-label="Pilih mode"
				className="mb-8 inline-flex rounded-xl border border-graphite bg-onyx p-1"
			>
				<button
					id="design-tab"
					type="button"
					role="tab"
					aria-selected={mode === "design"}
					aria-controls="design-panel"
					tabIndex={mode === "design" ? 0 : -1}
					onClick={() => setMode("design")}
					onKeyDown={onTabKeyDown}
					className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors sm:text-sm ${
						mode === "design"
							? "bg-charcoal text-snow shadow-xs"
							: "text-fog hover:text-mist"
					}`}
				>
					<FileText size={16} aria-hidden="true" />
					<span>Generate DESIGN.md</span>
				</button>
				<button
					id="html-tab"
					type="button"
					role="tab"
					aria-selected={mode === "html"}
					aria-controls="html-panel"
					tabIndex={mode === "html" ? 0 : -1}
					onClick={() => setMode("html")}
					onKeyDown={onTabKeyDown}
					className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors sm:text-sm ${
						mode === "html"
							? "bg-charcoal text-snow shadow-xs"
							: "text-fog hover:text-mist"
					}`}
				>
					<Code size={16} aria-hidden="true" />
					<span>Scrape HTML</span>
				</button>
			</div>

			<div className="w-full">
				<div
					id="design-panel"
					role="tabpanel"
					aria-labelledby="design-tab"
					hidden={mode !== "design"}
				>
					<DesignGeneratorPanel />
				</div>

				<div
					id="html-panel"
					role="tabpanel"
					aria-labelledby="html-tab"
					hidden={mode !== "html"}
				>
					<HtmlScraperPanel />
				</div>
			</div>
		</div>
	);
}
