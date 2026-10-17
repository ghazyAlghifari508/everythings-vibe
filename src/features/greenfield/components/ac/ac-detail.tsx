"use client";

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";
import { useState } from "react";
import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { TableOfContents } from "@/features/greenfield/components/prd/table-of-contents";
import { useAcGeneration } from "@/features/greenfield/hooks/use-ac-generation";
import { usePanelResize } from "@/features/greenfield/hooks/use-panel-resize";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store";
import type { Plan } from "@/types/database";
import { AcViewer } from "./ac-viewer";

interface AcDetailProps {
	projectId: string;
	projectName: string;
	latestAcContent?: string | null;
	latestPrdContent?: string;
	plan?: Plan;
	acStatus?: string | null;
}

/**
 * AC detail page: TOC sidebar, document view, paywall and save recovery.
 */
export function AcDetail({
	projectId,
	projectName,
	latestAcContent,
	latestPrdContent,
	plan = "free",
	acStatus,
}: AcDetailProps) {
	const navigate = useNavigate();
	const searchStr = useLocation({ select: (l) => l.searchStr });
	const creditsExhausted = useChatStore((s) => s.creditsExhausted);
	const setCreditsExhausted = useChatStore((s) => s.setCreditsExhausted);
	const { leftWidth, onStartDragLeft, isDraggingLeft } = usePanelResize();

	const {
		acContent,
		handleGenerate,
		handleRetrySave,
		hasError,
		isGenerating,
		isRetrySaving,
		saveFailed,
		streamingContent,
		thinkingText,
	} = useAcGeneration({
		projectId,
		plan,
		acStatus,
		latestPrdContent,
		latestAcContent,
		searchStr,
		navigate,
	});

	const [paywallOpen, setPaywallOpen] = useState(false);

	if (!latestPrdContent) {
		return (
			<div className="flex h-dvh items-center justify-center bg-onyx text-(--text-primary)">
				<div className="text-center">
					<FileText
						size={64}
						className="mx-auto mb-4 text-(--text-secondary)"
					/>
					<h2 className="mb-2 text-xl font-[510] text-(--text-primary)">
						PRD Belum Tersedia
					</h2>
					<p className="mb-6 text-(--text-secondary)">
						Generate PRD terlebih dahulu sebelum membuat Acceptance Criteria.
					</p>
					<Link
						to="/prd/$id"
						params={{ id: projectId }}
						className="btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2"
					>
						<ArrowRight size={16} /> Ke PRD
					</Link>
				</div>
			</div>
		);
	}

	const isStreaming = isGenerating;

	return (
		<>
			<div className="flex h-dvh flex-col overflow-hidden bg-onyx text-(--text-primary)">
				<div className="flex flex-1 overflow-hidden">
					{/* Left: TOC — width/handle live on this wrapper: the aside below
				    scrolls (overflow-y-auto), and a scrolling ancestor clips
				    absolutely positioned children at its padding edge, which
				    shifts the resize hitbox left of the divider. */}
					<div
						style={{ width: `${leftWidth}px`, background: "var(--bg-page)" }}
						className={cn(
							"relative hidden h-full shrink-0 md:block",
							!isDraggingLeft && "transition-[width] duration-300",
						)}
					>
						<aside className="h-full w-full overflow-y-auto overflow-x-hidden border-r border-(--color-graphite) bg-onyx p-4">
							{isStreaming && !streamingContent ? (
								<div className="space-y-2.5">
									{[1, 2, 3, 4, 5, 6].map((i) => (
										<div
											key={i}
											className="h-3.5 rounded bg-steel/60 animate-pulse"
											style={{ width: `${55 + (i % 3) * 15}%` }}
										/>
									))}
								</div>
							) : (
								<TableOfContents
									content={isStreaming ? streamingContent : acContent || ""}
									maxLevel={2}
								/>
							)}
						</aside>
						<div
							aria-hidden="true"
							className="absolute right-[-4px] top-0 z-10 h-full w-2 cursor-col-resize transition-colors hover:bg-indigo/20"
							onMouseDown={onStartDragLeft}
						/>
					</div>

					{/* Center Document View */}
					<div
						className={cn("flex min-w-0 flex-1 flex-col overflow-hidden")}
						style={{ background: "var(--bg-page)" }}
					>
						{/* Topbar */}
						<div className="flex shrink-0 items-center border-b border-(--color-graphite) bg-obsidian px-4 py-3">
							<h1 className="truncate font-(--font-inter) text-lg font-[510] text-(--text-primary)">
								AC - {projectName}
							</h1>
						</div>

						{saveFailed && (
							<div
								role="alert"
								className="flex shrink-0 flex-wrap items-center gap-3 border-b border-(--color-graphite) bg-amber-500/10 px-4 py-3 text-sm"
							>
								<span className="text-amber-500">
									AC berhasil digenerate tetapi gagal disimpan karena masalah
									koneksi database.
								</span>
								<button
									type="button"
									onClick={handleRetrySave}
									disabled={isRetrySaving}
									className="rounded-md bg-amber-500 px-3 py-1.5 font-[510] text-black transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									{isRetrySaving ? "Menyimpan..." : "Retry Simpan (Tanpa AI)"}
								</button>
								<button
									type="button"
									onClick={handleGenerate}
									disabled={isRetrySaving}
									className="rounded-md border border-(--color-graphite) px-3 py-1.5 text-(--text-secondary) transition-colors hover:bg-white/5 disabled:opacity-50"
								>
									Generate Ulang
								</button>
							</div>
						)}

						{plan === "free" && !acContent && !isGenerating && (
							<div className="shrink-0 border-t border-graphite px-4 py-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<p className="text-sm text-fog">
										Generate Acceptance Criteria hanya untuk paket Pro/Hengker.
									</p>
									<button
										type="button"
										onClick={() => setPaywallOpen(true)}
										className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
									>
										<span className="whitespace-nowrap">Upgrade ke Pro</span>
										<ArrowRight size={12} />
									</button>
								</div>
							</div>
						)}
						{/* AC Viewer: thinking renders once inside GenerationProgress — no second panel. */}
						<div className="flex-1 overflow-hidden">
							<AcViewer
								content={acContent}
								streamingContent={streamingContent}
								isStreaming={isStreaming}
								hasError={hasError}
								thinkingText={thinkingText}
								onGenerate={handleGenerate}
								projectName={projectName}
								plan={plan}
								className=""
							/>
						</div>
					</div>
				</div>
			</div>

			<CreditExhaustedModal
				isOpen={creditsExhausted?.stage === "ac" || paywallOpen}
				onClose={() => {
					setCreditsExhausted(null);
					setPaywallOpen(false);
				}}
				errorMessage={
					paywallOpen && creditsExhausted?.stage !== "ac"
						? "Upgrade ke Pro untuk generate Acceptance Criteria dan lanjut ke tahap berikutnya."
						: creditsExhausted?.message || ""
				}
				title={
					paywallOpen && creditsExhausted?.stage !== "ac"
						? "Lanjut ke AC butuh Pro"
						: undefined
				}
				projectId={projectId}
				stage="ac"
				currentPlan={plan}
			/>
		</>
	);
}
