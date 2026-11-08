"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { DesignTokenModel } from "@/features/scrape/services/design-model";
import {
	type DesignInspectorModel,
	designModelFromEvidence,
	inspectorFromModel,
	parseDesignMd,
} from "@/features/scrape/utils/design-md-inspector";
import {
	type DesignThemeKey,
	designCaptureScopes,
	designThemeNotice,
	designThemeOptions,
	designViewportOptions,
	scopedDesignMd,
	selectedViewIds,
} from "@/features/scrape/utils/design-view-contexts";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import { cn } from "@/lib/utils";
import { DesignAgentPromptDialog } from "./design-agent-prompt-dialog";
import { DesignMdSourcePanel } from "./design-md-source-panel";
import { DesignSystemInspector } from "./design-system-inspector";

export interface DesignResultProps {
	sourceUrl: string;
	domain: string;
	designMd: string;
	visualEvidence?: unknown;
	enrichment?: "applied" | "unavailable";
	enrichmentDetail?: string;
	onRetryEnrichment?: () => Promise<void> | void;
	isRetryingEnrichment?: boolean;
}

export interface ResolvedInspector {
	model: DesignInspectorModel;
	// "observed" means the values came from a verified browser capture whose
	// document still matches that capture. "unverified" means only the archived
	// markdown could be parsed, so values are shown as parsed text, never as
	// capture-verified measurements.
	source: "observed" | "unverified";
	/** The verified structured model; null when only an archive is available. */
	designModel: DesignTokenModel | null;
}

// Single decision point for what the inspector shows. The archive fallback is
// explicit here and never presented as equivalent to verified evidence.
export function resolveInspector(
	visualEvidence: unknown,
	designMd: string,
): ResolvedInspector {
	const designModel = designModelFromEvidence(visualEvidence, designMd);
	if (designModel)
		return {
			model: inspectorFromModel(designModel, "observed"),
			source: "observed",
			designModel,
		};
	return {
		model: { ...parseDesignMd(designMd), verification: "unverified" },
		source: "unverified",
		designModel: null,
	};
}

type MobileTab = "inspector" | "design";

const SECTION_NAV: { label: string; href: string; key: string }[] = [
	{ label: "Overview", href: "#overview", key: "overview" },
	{ label: "Colors", href: "#colors", key: "colors" },
	{ label: "Typography", href: "#typography", key: "typography" },
	{ label: "Spacing", href: "#spacing", key: "spacing" },
	{ label: "Components", href: "#components", key: "components" },
	{ label: "Surfaces", href: "#surfaces", key: "surfaces" },
	{ label: "Elevation", href: "#elevation", key: "elevation" },
	{ label: "Panduan", href: "#guidelines", key: "guidelines" },
	{ label: "Keterbatasan", href: "#limitations", key: "limitations" },
];

export function DesignResult({
	sourceUrl,
	domain,
	designMd,
	visualEvidence,
	enrichment,
	enrichmentDetail,
	onRetryEnrichment,
	isRetryingEnrichment,
}: DesignResultProps) {
	const [agentOpen, setAgentOpen] = useState(false);
	const [mobileTab, setMobileTab] = useState<MobileTab>("inspector");
	const [viewportKey, setViewportKey] = useState<string | null>(null);
	const [themeKey, setThemeKey] = useState<DesignThemeKey | null>(null);
	const siteName = displaySiteName(domain);
	const { model, source, designModel } = useMemo(
		() => resolveInspector(visualEvidence, designMd),
		[designMd, visualEvidence],
	);
	// One selection drives the inspector and the document panel. Both are derived
	// from the verified capture model, so the two panes cannot describe different
	// contexts, and a selection that no longer exists falls back to the first
	// measured option instead of leaving an empty view.
	const viewports = useMemo(
		() => designViewportOptions(designModel),
		[designModel],
	);
	const activeViewport = viewports.some((option) => option.key === viewportKey)
		? viewportKey
		: (viewports[0]?.key ?? null);
	const themes = useMemo(
		() => designThemeOptions(designModel, activeViewport),
		[designModel, activeViewport],
	);
	// Requested appearances the capture could not verify are explained next to
	// the context controls; a verified or unrequested theme explains nothing.
	const themeNotice = useMemo(
		() => designThemeNotice(designModel, activeViewport),
		[designModel, activeViewport],
	);
	const activeTheme =
		themeKey && themes.includes(themeKey) ? themeKey : (themes[0] ?? null);
	const viewIds = useMemo(
		() =>
			selectedViewIds(designModel, {
				viewport: activeViewport,
				theme: activeTheme,
			}),
		[designModel, activeViewport, activeTheme],
	);
	const contextModel = useMemo(
		() =>
			source === "observed" &&
			designModel &&
			viewIds.length < (designModel.views?.length ?? 0)
				? inspectorFromModel(designModel, "observed", { viewIds })
				: model,
		[designModel, model, source, viewIds],
	);
	const scopes = useMemo(() => designCaptureScopes(designModel), [designModel]);
	// View-only scope: the canonical document, its copy action and its download
	// always keep every capture.
	const previewMd = useMemo(
		() =>
			source === "observed"
				? scopedDesignMd(designMd, scopes, {
						viewport: activeViewport,
						theme: activeTheme,
					})
				: undefined,
		[activeTheme, activeViewport, designMd, scopes, source],
	);
	const contextLabel = useMemo(() => {
		const parts: string[] = [];
		const option = viewports.find((entry) => entry.key === activeViewport);
		if (option) parts.push(`${option.label} ${option.detail}`);
		if (activeTheme)
			parts.push(activeTheme === "light" ? "tema terang" : "tema gelap");
		return parts.join(" · ");
	}, [activeTheme, activeViewport, viewports]);

	const navItems = SECTION_NAV.filter((item) => {
		if (item.key === "colors") return contextModel.colors.length > 0;
		if (item.key === "typography")
			return (
				contextModel.typography.length > 0 || contextModel.typefaces.length > 0
			);
		if (item.key === "spacing")
			return contextModel.spacing.length > 0 || contextModel.radii.length > 0;
		if (item.key === "components") return contextModel.components.length > 0;
		if (item.key === "surfaces") return contextModel.surfaces.length > 0;
		if (item.key === "elevation") return contextModel.elevation.length > 0;
		if (item.key === "guidelines")
			return contextModel.dos.length > 0 || contextModel.donts.length > 0;
		if (item.key === "limitations") return contextModel.limitations.length > 0;
		return true;
	});
	const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const inspectorTabId = `${instanceId}-inspector-tab`;
	const designTabId = `${instanceId}-design-tab`;
	const inspectorPanelId = `${instanceId}-inspector-panel`;
	const designPanelId = `${instanceId}-design-panel`;
	const inspectorTabRef = useRef<HTMLButtonElement>(null);
	const designTabRef = useRef<HTMLButtonElement>(null);

	function selectMobileTab(next: MobileTab) {
		setMobileTab(next);
		if (next === "inspector") inspectorTabRef.current?.focus();
		else designTabRef.current?.focus();
	}

	return (
		<div className="min-w-0 w-full">
			<nav
				aria-label="Bagian style reference"
				className="mb-4 flex gap-2 overflow-x-auto pb-1"
			>
				{navItems.map((item) => (
					<a
						key={item.key}
						href={item.href}
						className="shrink-0 rounded-full border border-graphite px-3 py-1.5 text-xs font-medium text-fog transition-colors hover:border-slate hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{item.label}
					</a>
				))}
			</nav>

			<div
				role="tablist"
				aria-label="Tampilan style reference"
				className="mb-6 flex border-b border-graphite lg:hidden"
			>
				<button
					ref={inspectorTabRef}
					id={inspectorTabId}
					type="button"
					role="tab"
					aria-selected={mobileTab === "inspector"}
					aria-controls={inspectorPanelId}
					tabIndex={mobileTab === "inspector" ? 0 : -1}
					onClick={() => setMobileTab("inspector")}
					onKeyDown={(event) => {
						if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
							event.preventDefault();
							selectMobileTab("design");
						}
					}}
					className={cn(
						"min-h-[44px] flex-1 border-b-2 py-2.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo",
						mobileTab === "inspector"
							? "border-indigo text-snow"
							: "border-transparent text-fog hover:text-mist",
					)}
				>
					Inspector
				</button>
				<button
					ref={designTabRef}
					id={designTabId}
					type="button"
					role="tab"
					aria-selected={mobileTab === "design"}
					aria-controls={designPanelId}
					tabIndex={mobileTab === "design" ? 0 : -1}
					onClick={() => setMobileTab("design")}
					onKeyDown={(event) => {
						if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
							event.preventDefault();
							selectMobileTab("inspector");
						}
					}}
					className={cn(
						"min-h-[44px] flex-1 border-b-2 py-2.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo",
						mobileTab === "design"
							? "border-indigo text-snow"
							: "border-transparent text-fog hover:text-mist",
					)}
				>
					DESIGN.md
				</button>
			</div>

			<div className="grid min-w-0 w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:gap-8">
				<div
					id={inspectorPanelId}
					role="tabpanel"
					aria-labelledby={inspectorTabId}
					className={cn(
						"min-w-0",
						mobileTab !== "inspector" && "hidden lg:block",
					)}
				>
					<DesignSystemInspector
						siteName={siteName}
						sourceUrl={sourceUrl}
						model={contextModel}
						contextLabel={contextLabel || undefined}
					/>
				</div>
				<div
					id={designPanelId}
					role="tabpanel"
					aria-labelledby={designTabId}
					className={cn(
						"min-w-0 lg:sticky lg:top-20",
						mobileTab !== "design" && "hidden lg:block",
					)}
				>
					<DesignMdSourcePanel
						designMd={designMd}
						previewMd={previewMd}
						viewports={viewports}
						viewport={activeViewport}
						onViewportChange={setViewportKey}
						themes={themes}
						theme={activeTheme}
						onThemeChange={setThemeKey}
						themeNotice={themeNotice}
						inspectorSource={source}
						enrichment={enrichment}
						enrichmentDetail={enrichmentDetail}
						onRetryEnrichment={onRetryEnrichment}
						isRetryingEnrichment={isRetryingEnrichment}
						onImplementAgent={() => setAgentOpen(true)}
						className="lg:max-h-[calc(100vh-6rem)]"
					/>
				</div>
				<DesignAgentPromptDialog
					open={agentOpen}
					onOpenChange={setAgentOpen}
					siteName={siteName}
					sourceUrl={sourceUrl}
					designMd={designMd}
					enrichment={enrichment}
				/>
			</div>
		</div>
	);
}
