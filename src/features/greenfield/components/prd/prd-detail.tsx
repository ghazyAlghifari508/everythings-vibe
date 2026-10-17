"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useState, useTransition } from "react";
import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { ChatPanel } from "@/features/greenfield/components/chat/chat-panel";
import { GenerationProgress } from "@/features/greenfield/components/generation-progress";
import { usePanelResize } from "@/features/greenfield/hooks/use-panel-resize";
import { usePrdDetail } from "@/features/greenfield/hooks/use-prd-detail";
import { isPrdLocked } from "@/lib/flow-progress";
import { cn } from "@/lib/utils";
import { useChatStore, useUIStore } from "@/store";
import type { Plan, PrdVersion } from "@/types/database";
import { PrdViewer } from "./prd-viewer";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface PrdDetailProps {
	projectId?: string;
	projectName?: string;
	step?: string | null;
	latestVersion?: PrdVersion;
	allVersions?: PrdVersion[];
	conversationId?: string;
	isChatOpen?: boolean;
	plan?: Plan;
	revisionLimit?: number;
	initialMessages?: Array<{
		id: string;
		role: string;
		content: string;
		created_at: string;
	}>;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function PrdDetail({
	projectId,
	projectName: _projectName,
	step,
	latestVersion,
	allVersions = [],
	conversationId,
	isChatOpen: _initialChatOpen = false,
	plan = "free",
	revisionLimit: _revisionLimit,
	initialMessages = [],
}: PrdDetailProps) {
	const isReadOnly = isPrdLocked(step);
	// ── State ──
	const [activeTab, setActiveTab] = useState<"doc" | "chat">("doc");
	const isChatOpen = useUIStore((s) => s.isChatPanelOpen);
	const isPaywallOpen = useUIStore((s) => s.isPaywallOpen);
	const paywallStage = useUIStore((s) => s.paywallStage);
	const openPaywallModal = useUIStore((s) => s.openPaywallModal);
	const closePaywallModal = useUIStore((s) => s.closePaywallModal);
	const toggleChat = useUIStore((s) => s.toggleChatPanel);

	// ── Hooks ──
	const { rightWidth, onStartDragRight, isDraggingRight } = usePanelResize();
	const navigate = useNavigate();
	const search = useLocation({ select: (l) => l.search });
	const [, startTransition] = useTransition();
	const {
		isGeneratingPRD,
		streamingPRDContent,
		creditsExhausted,
		setCreditsExhausted,
	} = useChatStore();

	const {
		currentContent,
		handlePrdRevised,
		handleVersionSelect,
		mappedVersions,
		selectedVersionNum,
		streamingForView,
	} = usePrdDetail({
		projectId,
		latestVersion,
		allVersions,
		initialMessages,
		search,
	});

	const handleProjectCreated = (newProjectId: string) => {
		startTransition(() => {
			navigate({ to: "/prd/$id", params: { id: newProjectId } });
		});
	};

	// ── Render ──

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-onyx text-snow">
			{/* ═══════════ Mobile Tab Toggle (<md) ═══════════ */}
			<div className="flex shrink-0 border-b border-graphite bg-charcoal md:hidden">
				<button
					type="button"
					onClick={() => setActiveTab("doc")}
					className={cn(
						"flex-1 py-2.5 text-center text-sm font-[510] transition-colors border-b-2",
						activeTab === "doc"
							? "border-indigo text-snow bg-white/5"
							: "border-transparent text-fog hover:text-snow",
					)}
				>
					Dokumen
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("chat")}
					className={cn(
						"flex-1 py-2.5 text-center text-sm font-[510] transition-colors border-b-2",
						activeTab === "chat"
							? "border-indigo text-snow bg-white/5"
							: "border-transparent text-fog hover:text-snow",
					)}
				>
					Chat
				</button>
			</div>

			<div className="flex flex-1 overflow-hidden">
				{/* ═══════════ Center Panel (Document View) ═══════════ */}
				<div
					className={cn(
						"flex flex-1 flex-col overflow-hidden min-w-0",
						activeTab !== "doc" && "hidden md:flex",
					)}
					style={{ background: "var(--bg-page)" }}
				>
					{/* Default: PRD content (streaming or saved) */}
					<div className="flex flex-1 flex-col overflow-hidden relative">
						{/* Mobile-only spinner — keeps the full-page blocker for small screens
                where the chat progress card isn't visible. Desktop users see the
                empty PrdViewer + the section progress card in the chat panel. */}
						{/* Pre-stream / waiting-for-first-token: plain load first
						    (desktop+mobile), then rotating thinking steps once the model
						    has been silent a few seconds. Real content replaces it. */}
						{isGeneratingPRD && !streamingPRDContent && !latestVersion && (
							<div className="absolute inset-0 z-10 overflow-y-auto bg-onyx">
								<GenerationProgress label="PRD" isStreaming={isGeneratingPRD} />
							</div>
						)}
						<PrdViewer
							content={streamingForView ? streamingForView : currentContent}
							plan={plan}
							versions={mappedVersions}
							currentVersion={selectedVersionNum}
							onSelectVersion={handleVersionSelect}
							className="flex-1 overflow-hidden"
						/>
						{plan === "free" && latestVersion && (
							<div className="shrink-0 border-t border-graphite bg-charcoal/40 px-4 py-3">
								<div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
									<p className="text-sm text-fog">
										Lanjut ke AC butuh Pro — Generate Acceptance Criteria hanya
										untuk paket Pro/Hengker.
									</p>
									<button
										type="button"
										onClick={() => openPaywallModal("ac")}
										className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
									>
										<span className="whitespace-nowrap">Upgrade ke Pro</span>
										<ArrowRight size={12} />
									</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* ═══════════ Right Panel: Desktop Chat ═══════════ */}
				<div
					id="print-hide-chat"
					style={{
						width: isChatOpen ? `${rightWidth}px` : "0px",
						background: "var(--bg-elevated)",
					}}
					className={cn(
						"group/right-sidebar relative hidden shrink-0 border-l border-graphite print:hidden xl:block",
						!isDraggingRight && "transition-all duration-300",
						!isChatOpen && "overflow-hidden border-none",
					)}
				>
					{isChatOpen && (
						<div
							aria-hidden="true"
							className="absolute bottom-0 left-[-4px] top-0 z-10 w-2 cursor-col-resize transition-colors hover:bg-indigo/20"
							onMouseDown={onStartDragRight}
						/>
					)}
					<div
						className="h-full w-full"
						style={{ display: isChatOpen ? "block" : "none" }}
					>
						<ChatPanel
							projectId={projectId}
							conversationId={conversationId}
							onProjectCreated={handleProjectCreated}
							onPrdRevised={handlePrdRevised}
							className="w-full"
							enableAutoSubmit={true}
							inputDisabled={!projectId && !isGeneratingPRD}
							isReadOnly={isReadOnly}
							currentPrdContent={currentContent}
							userPlan={plan}
							selectedVersionNum={selectedVersionNum}
						/>
					</div>
				</div>

				{/* ═══════════ Mobile Chat View (<md) & Drawer (md to xl) ═══════════ */}
				{/* 1. Full panel for Mobile View tab toggle (<md) */}
				{activeTab === "chat" && (
					<div className="flex-1 overflow-hidden md:hidden">
						<ChatPanel
							projectId={projectId}
							conversationId={conversationId}
							onProjectCreated={handleProjectCreated}
							onPrdRevised={handlePrdRevised}
							className="h-full w-full border-none"
							enableAutoSubmit={false}
							inputDisabled={!projectId && !isGeneratingPRD}
							isReadOnly={isReadOnly}
							currentPrdContent={currentContent}
							userPlan={plan}
							selectedVersionNum={selectedVersionNum}
						/>
					</div>
				)}

				{/* 2. Slide-over drawer for tablet screens (md to xl) */}
				<div className="hidden md:block xl:hidden print:hidden">
					{isChatOpen && (
						<div
							role="dialog"
							aria-modal="true"
							aria-label="Panel chat revisi"
							className="fixed bottom-0 left-0 right-0 z-40 h-[60vh] rounded-t-xl bg-charcoal shadow-[var(--shadow-overlay)]"
						>
							<div className="flex items-center justify-between border-b border-graphite px-4 py-2">
								<span className="text-sm font-[510]">Chat</span>
								<button
									type="button"
									onClick={toggleChat}
									aria-label="Tutup chat"
									className="text-fog hover:text-snow"
								>
									<X size={16} />
								</button>
							</div>
							<div className="h-[calc(60vh-44px)]">
								<ChatPanel
									projectId={projectId}
									conversationId={conversationId}
									onProjectCreated={handleProjectCreated}
									onPrdRevised={handlePrdRevised}
									className="w-full border-none"
									enableAutoSubmit={false}
									inputDisabled={!projectId && !isGeneratingPRD}
									isReadOnly={isReadOnly}
									currentPrdContent={currentContent}
									userPlan={plan}
									selectedVersionNum={selectedVersionNum}
								/>
							</div>
						</div>
					)}
				</div>
			</div>

			<CreditExhaustedModal
				isOpen={creditsExhausted?.stage === "prd" || isPaywallOpen}
				onClose={() => {
					if (creditsExhausted?.stage === "prd") {
						setCreditsExhausted(null);
					}
					closePaywallModal();
				}}
				errorMessage={
					isPaywallOpen && creditsExhausted?.stage !== "prd"
						? "Upgrade ke Pro untuk generate Acceptance Criteria dan lanjut ke tahap berikutnya."
						: creditsExhausted?.message || ""
				}
				title={
					isPaywallOpen && creditsExhausted?.stage !== "prd"
						? "Lanjut ke AC butuh Pro"
						: undefined
				}
				projectId={projectId || ""}
				stage={
					creditsExhausted?.stage === "prd"
						? "prd"
						: paywallStage === "prd" || paywallStage === "task"
							? paywallStage
							: "ac"
				}
				currentPlan={plan}
			/>
		</div>
	);
}
