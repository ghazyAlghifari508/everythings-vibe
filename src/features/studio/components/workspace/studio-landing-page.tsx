"use client";

import { Folder02Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { PageHeading } from "@/components/ui";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { getCanvasDotStyle } from "@/features/greenfield/components/whiteboard/canvas-connectors";
import type { ScrapeDesignSource } from "@/features/scrape/services/scrape-design-md-service";
import {
	type LaunchComposerConfig,
	StudioLaunchComposer,
} from "@/features/studio/components/composer/studio-launch-composer";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";
import { StudioShortcutCarousel } from "@/features/studio/components/studio-shortcut-carousel";
import { StudioLandingProfile } from "@/features/studio/components/workspace/studio-landing-profile";
import { StudioMobileHistoryDrawer } from "@/features/studio/components/workspace/studio-mobile-history-drawer";
import { StudioSidebar } from "@/features/studio/components/workspace/studio-sidebar";
import { useStudioHistoryActions } from "@/features/studio/hooks/use-studio-history-actions";
import { STUDIO_DEFAULT_PAGE_COUNT } from "@/features/studio/services/studio-generation-options";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "@/features/studio/services/studio-presets";
import {
	STUDIO_PROMPT_SHORTCUTS,
	type StudioPromptShortcut,
} from "@/features/studio/services/studio-prompt-shortcuts";
import type {
	AttachedLogo,
	StudioHistoryItem,
} from "@/features/studio/types/studio";

/** A design reference staged on the landing screen, not yet sent. */
export type StagedReference =
	| { kind: "theme"; id: string; designMd: string }
	| { kind: "scrape"; id: string; label: string }
	| {
			kind: "custom";
			filename: string;
			designMd: string;
			logo: AttachedLogo | null;
	  };

/**
 * Landing screen for VibeDesign Studio: project history, the launch composer,
 * and the prompt shortcut carousel.
 *
 * The route keeps the search schema and the loader; this container owns the
 * staged-draft state and the navigation side effects.
 */
export function StudioLandingPage({
	history,
	scrapeSources,
	search,
}: {
	history: StudioHistoryItem[];
	scrapeSources: ScrapeDesignSource[];
	search: { prompt?: string; from?: string };
}) {
	const navigate = useNavigate();

	const [prompt, setPrompt] = useState(search.prompt ?? "");
	const [config, setConfig] = useState<LaunchComposerConfig>({
		designMode: "web",
		initialPageCount: STUDIO_DEFAULT_PAGE_COUNT,
	});
	const [stagedReference, setStagedReference] =
		useState<StagedReference | null>(null);
	const [stagedPrd, setStagedPrd] = useState<{
		filename: string;
		content: string;
	} | null>(null);
	const [isPickerOpen, setIsPickerOpen] = useState(false);
	const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
	const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(
		null,
	);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const isSubmittingRef = useRef(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (search.prompt !== undefined) setPrompt(search.prompt);
	}, [search.prompt]);

	const handleOpenProject = (id: string) => {
		setIsMobileDrawerOpen(false);
		void navigate({
			to: "/design/$id",
			params: { id },
		});
	};

	const { deleteProject, renameProject, duplicateProject } =
		useStudioHistoryActions();

	function applyShortcut(shortcut: StudioPromptShortcut) {
		setPrompt(shortcut.prompt);
		setSelectedShortcutId(shortcut.id);
		setConfig((previous) => ({
			...previous,
			designMode: shortcut.designMode,
			initialPageCount: shortcut.initialPageCount,
		}));
		setError("");
		textareaRef.current?.focus();
	}

	function handleSelectTheme(presetId: string) {
		const designMd = getStudioPresetDesignMd(presetId);
		if (!designMd) {
			setError("Tema tidak tersedia. Pilih tema lain.");
			return;
		}
		setStagedReference({ kind: "theme", id: presetId, designMd });
		setError("");
		textareaRef.current?.focus();
	}

	function handleSelectCustom(input: {
		filename: string;
		designMd: string;
		logo: AttachedLogo | null;
	}) {
		setStagedReference({
			kind: "custom",
			filename: input.filename,
			designMd: input.designMd,
			logo: input.logo,
		});
		setError("");
		textareaRef.current?.focus();
	}

	function handleSelectScrape(source: ScrapeDesignSource) {
		setStagedReference({
			kind: "scrape",
			id: source.id,
			label: source.title ?? source.domain,
		});
		setError("");
		textareaRef.current?.focus();
	}

	const referenceLabel = stagedReference
		? stagedReference.kind === "theme"
			? (STUDIO_DESIGN_PRESETS.find(
					(preset) => preset.id === stagedReference.id,
				)?.name ?? "Tema")
			: stagedReference.kind === "scrape"
				? stagedReference.label
				: stagedReference.filename
		: null;

	async function submit() {
		if (loading || isSubmittingRef.current) return;
		if (!prompt.trim()) {
			setError("Ceritakan UI yang mau dibuat dulu.");
			textareaRef.current?.focus();
			return;
		}
		isSubmittingRef.current = true;
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/studio/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: prompt.trim(),
					designMode: config.designMode,
					initialPageCount: config.initialPageCount,
					designReference: stagedReference
						? stagedReference.kind === "theme"
							? { kind: "theme", id: stagedReference.id }
							: stagedReference.kind === "scrape"
								? { kind: "scrape", id: stagedReference.id }
								: { kind: "custom", filename: stagedReference.filename }
						: null,
					// A scrape reference carries no document: the server reads the
					// stored DESIGN.md for the caller.
					designMd:
						stagedReference && "designMd" in stagedReference
							? stagedReference.designMd
							: null,
					prdAttachment: stagedPrd
						? {
								filename: stagedPrd.filename,
								content: stagedPrd.content,
							}
						: null,
					logo:
						stagedReference?.kind === "custom" && stagedReference.logo
							? {
									filename: stagedReference.logo.filename,
									mimeType: stagedReference.logo.mimeType,
									data: stagedReference.logo.data,
								}
							: null,
				}),
			});
			const data = (await res.json().catch(() => null)) as {
				projectId?: string;
				error?: string;
			} | null;
			if (!res.ok || !data?.projectId) {
				setError(data?.error ?? "Studio gagal generate. Coba lagi.");
				return;
			}
			void navigate({
				to: "/design/$id",
				params: { id: data.projectId },
			});
		} catch {
			setError("Jaringan bermasalah. Draf tetap tersimpan, coba lagi.");
		} finally {
			isSubmittingRef.current = false;
			setLoading(false);
		}
	}

	return (
		<div
			style={getCanvasDotStyle(1, { x: 0, y: 0 })}
			className="flex min-h-dvh w-full flex-col overflow-x-clip bg-onyx text-snow"
		>
			<header className="flex w-full shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
				<div className="flex min-w-0 items-center">
					<Logo height={26} />
				</div>
				<div className="flex items-center gap-1.5">
					<StudioLandingProfile />
					<button
						type="button"
						onClick={() => setIsMobileDrawerOpen(true)}
						className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-steel md:hidden"
					>
						<Icon
							icon={Folder02Icon}
							size={14}
							className="text-fog"
							aria-hidden
						/>
						<span>Project ({history.length})</span>
					</button>
				</div>
			</header>

			<div className="flex w-full flex-1 items-start gap-5 px-4 pb-6 sm:px-6 md:gap-6 lg:gap-8 lg:px-8">
				<StudioSidebar
					history={history}
					onSelectProject={handleOpenProject}
					onDeleteProject={deleteProject}
					onRenameProject={renameProject}
					onDuplicateProject={duplicateProject}
					className="sticky top-4 hidden h-[calc(100dvh-5.5rem)] min-h-[480px] max-h-[calc(100dvh-5.5rem)] w-72 shrink-0 overflow-hidden md:flex lg:w-80"
				/>

				<StudioMobileHistoryDrawer
					open={isMobileDrawerOpen}
					onOpenChange={setIsMobileDrawerOpen}
					history={history}
					onSelectProject={handleOpenProject}
					onDeleteProject={deleteProject}
					onRenameProject={renameProject}
					onDuplicateProject={duplicateProject}
				/>

				<main className="flex min-w-0 flex-1 self-stretch flex-col justify-center py-4 md:py-6">
					<div className="my-auto flex w-full max-w-5xl flex-col gap-6 lg:max-w-6xl xl:max-w-7xl">
						<div className="space-y-3 text-center sm:text-left">
							<div className="flex justify-center sm:justify-start">
								<HubBreadcrumb current="VibeDesign" />
							</div>
							<div className="space-y-2">
								<PageHeading variant="display">
									What will you design?
								</PageHeading>
								<p className="max-w-2xl font-inter text-sm leading-relaxed text-fog sm:text-base">
									Jelaskan aplikasi yang ingin dibuat, lalu lihat hasil
									desainnya.
								</p>
							</div>
						</div>

						<StudioLaunchComposer
							prompt={prompt}
							onPromptChange={(value) => {
								setPrompt(value);
								setSelectedShortcutId(null);
								if (error) setError("");
							}}
							config={config}
							onConfigChange={(patch) =>
								setConfig((previous) => ({ ...previous, ...patch }))
							}
							reference={
								referenceLabel
									? {
											label: referenceLabel,
											logoFilename:
												stagedReference?.kind === "custom"
													? (stagedReference.logo?.filename ?? null)
													: null,
										}
									: null
							}
							onOpenDesignPicker={() => setIsPickerOpen(true)}
							prd={stagedPrd}
							onPrdChange={setStagedPrd}
							loading={loading}
							error={error}
							onError={setError}
							onSubmit={() => void submit()}
							textareaRef={textareaRef}
						/>

						<StudioShortcutCarousel
							shortcuts={STUDIO_PROMPT_SHORTCUTS}
							onSelect={applyShortcut}
							selectedId={selectedShortcutId}
						/>
					</div>
				</main>
			</div>

			<StudioDesignPickerDialog
				open={isPickerOpen}
				onOpenChange={setIsPickerOpen}
				selectedThemeId={
					stagedReference?.kind === "theme" ? stagedReference.id : null
				}
				selectedScrapeId={
					stagedReference?.kind === "scrape" ? stagedReference.id : null
				}
				scrapeSources={scrapeSources}
				onSelectTheme={handleSelectTheme}
				onSelectCustom={handleSelectCustom}
				onSelectScrape={handleSelectScrape}
				onClear={() => setStagedReference(null)}
			/>
		</div>
	);
}
