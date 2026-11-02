"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";
import {
	StudioDesignCustomPanel,
	type StudioDesignCustomState,
} from "@/features/studio/components/design-system/studio-design-custom-panel";
import {
	StudioDesignTemplatePanel,
	StudioDesignThemePanel,
} from "@/features/studio/components/design-system/studio-design-picker-panels";
import { StudioScrapeDesignSources } from "@/features/studio/components/design-system/studio-scrape-design-sources";
import { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import { getStudioPresetDesignMd } from "@/features/studio/services/studio-presets";
import type { AttachedLogo } from "@/features/studio/types/studio";

export type DesignPickerTab = "tema" | "template" | "milik";

const TABS: { id: DesignPickerTab; label: string }[] = [
	{ id: "tema", label: "Tema" },
	{ id: "template", label: "Template" },
	{ id: "milik", label: "Punya Saya" },
];

const EMPTY_CUSTOM: StudioDesignCustomState = {
	mdName: null,
	mdText: "",
	mdError: null,
	reading: false,
	logo: null,
	logoError: null,
};

// Visual design picker: curated themes, coming-soon templates, and a compact
// custom DESIGN.md upload. Selecting never generates; the parent stages the
// reference and only sends it on explicit submit.
export function StudioDesignPickerDialog({
	open,
	onOpenChange,
	selectedThemeId,
	selectedScrapeId,
	customFilename,
	scrapeSources,
	onSelectTheme,
	onSelectCustom,
	onSelectScrape,
	onClear,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedThemeId: string | null;
	selectedScrapeId: string | null;
	customFilename: string | null;
	scrapeSources: ScrapeDesignSource[];
	onSelectTheme: (presetId: string) => void;
	onSelectCustom: (input: {
		filename: string;
		designMd: string;
		logo: AttachedLogo | null;
	}) => void;
	onSelectScrape: (source: ScrapeDesignSource) => void;
	onClear: () => void;
}) {
	const [tab, setTab] = useState<DesignPickerTab>("tema");
	const [pendingThemeId, setPendingThemeId] = useState<string | null>(null);
	const [custom, setCustom] = useState<StudioDesignCustomState>(EMPTY_CUSTOM);

	const activeThemeId = pendingThemeId ?? selectedThemeId;
	const customTokens = custom.mdText
		? extractDesignSystemTokens(custom.mdText)
		: null;
	const customValid =
		custom.mdName !== null &&
		custom.mdError === null &&
		custom.mdText.trim().length >= 20;
	const colorCount = customTokens
		? [
				customTokens.colors.primary,
				customTokens.colors.canvas,
				customTokens.colors.ink,
				customTokens.colors.surface,
				customTokens.colors.muted,
				customTokens.colors.border,
			].filter(Boolean).length + Object.keys(customTokens.colors.accents).length
		: 0;

	function resetCustom() {
		setCustom(EMPTY_CUSTOM);
	}

	function moveTab(delta: number) {
		const nextIdx =
			(TABS.findIndex((entry) => entry.id === tab) + delta + TABS.length) %
			TABS.length;
		setTab(TABS[nextIdx].id);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				hideCloseButton
				className="fixed inset-0 !inset-0 left-0 top-0 !left-0 !top-0 !translate-none !translate-x-0 !translate-y-0 w-screen h-dvh max-h-dvh max-w-none !m-0 rounded-none sm:rounded-none !rounded-none border-0 !border-0 shadow-none !shadow-none flex flex-col gap-0 !gap-0 overflow-hidden p-0 !p-0 bg-obsidian"
			>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20">
					<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
						<div className="flex items-start justify-between gap-4">
							<DialogHeader className="gap-1.5 text-left sm:text-left">
								<DialogTitle className="text-left text-xl font-bold tracking-tight text-snow sm:text-2xl">
									Pilih tampilan
								</DialogTitle>
								<DialogDescription className="max-w-xl text-left text-sm text-fog">
									Pilih referensi visual untuk proyek desainmu. Referensi
									tersimpan sebagai draf dan baru dipakai saat kamu menekan
									kirim.
								</DialogDescription>
							</DialogHeader>
							<DialogClose
								className="rounded-lg p-2 text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo shrink-0"
								aria-label="Close"
							>
								<Icon icon={Cancel01Icon} size={18} />
								<span className="sr-only">Close</span>
							</DialogClose>
						</div>

						<div className="flex justify-center">
							<div
								role="tablist"
								aria-label="Sumber referensi desain"
								className="inline-flex items-center gap-1 rounded-xl border border-graphite bg-onyx p-1"
							>
								{TABS.map((entry) => (
									<button
										key={entry.id}
										type="button"
										role="tab"
										aria-selected={tab === entry.id}
										onClick={() => setTab(entry.id)}
										onKeyDown={(e) => {
											if (e.key === "ArrowRight") moveTab(1);
											else if (e.key === "ArrowLeft") moveTab(-1);
										}}
										className={`min-h-9 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
											tab === entry.id
												? "bg-charcoal text-snow shadow-xs"
												: "text-fog hover:text-mist"
										}`}
									>
										{entry.label}
									</button>
								))}
							</div>
						</div>

						{tab === "tema" ? (
							<StudioDesignThemePanel
								activeThemeId={activeThemeId}
								onSelectTheme={setPendingThemeId}
							/>
						) : null}

						{tab === "template" ? <StudioDesignTemplatePanel /> : null}

						{tab === "milik" ? (
							<div className="flex flex-col gap-6">
								<StudioScrapeDesignSources
									sources={scrapeSources}
									selectedId={selectedScrapeId}
									onSelect={(source) => {
										onSelectScrape(source);
										onOpenChange(false);
									}}
								/>
								<StudioDesignCustomPanel
									state={custom}
									colorCount={colorCount}
									fontFamily={customTokens?.typography.fontFamily ?? null}
									onMdNameChange={(mdName, mdText) =>
										setCustom((previous) => ({ ...previous, mdName, mdText }))
									}
									onMdError={(mdError) =>
										setCustom((previous) => ({ ...previous, mdError }))
									}
									onReadingChange={(reading) =>
										setCustom((previous) => ({ ...previous, reading }))
									}
									onLogoChange={(logo) =>
										setCustom((previous) => ({ ...previous, logo }))
									}
									onLogoError={(logoError) =>
										setCustom((previous) => ({ ...previous, logoError }))
									}
								/>
							</div>
						) : null}

						<DialogFooter className="mt-4 flex flex-row items-center justify-between gap-2 border-t border-graphite/40 pt-4 sm:flex-row sm:justify-between">
							{selectedThemeId || customFilename || selectedScrapeId ? (
								<button
									type="button"
									onClick={() => {
										resetCustom();
										onClear();
										onOpenChange(false);
									}}
									className="rounded-lg px-3 py-2 text-xs font-semibold text-fog hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Lepas referensi
								</button>
							) : (
								<span />
							)}
							<span className="flex items-center gap-2">
								<Button
									type="button"
									variant="secondary"
									onClick={() => onOpenChange(false)}
								>
									Batal
								</Button>
								{tab === "tema" ? (
									<Button
										type="button"
										disabled={!activeThemeId}
										onClick={() => {
											if (!activeThemeId) return;
											const md = getStudioPresetDesignMd(activeThemeId);
											if (!md) return;
											onSelectTheme(activeThemeId);
											setPendingThemeId(null);
											onOpenChange(false);
										}}
									>
										Gunakan Tema
									</Button>
								) : null}
								{tab === "milik" ? (
									<Button
										type="button"
										disabled={!customValid}
										onClick={() => {
											if (!customValid || !custom.mdName) return;
											onSelectCustom({
												filename: custom.mdName,
												designMd: custom.mdText,
												logo: custom.logo,
											});
											resetCustom();
											onOpenChange(false);
										}}
									>
										Gunakan Desain Ini
									</Button>
								) : null}
							</span>
						</DialogFooter>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
