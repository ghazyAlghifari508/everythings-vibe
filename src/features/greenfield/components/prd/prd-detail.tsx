"use client";

import { ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { ChatPanel } from "@/features/greenfield/components/chat/chat-panel";
import { usePanelResize } from "@/features/greenfield/hooks/use-panel-resize";
import { usePrdDetail } from "@/features/greenfield/hooks/use-prd-detail";
import { PRD_CHAT_PANEL_ID } from "@/features/greenfield/types/greenfield-constants";
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
	const chatStyle: CSSProperties & { "--chat-width": string } = {
		"--chat-width": `${rightWidth}px`,
		background: "var(--bg-elevated)",
	};
	const navigate = useNavigate();
	const search = useLocation({ select: (l) => l.search });
	const [, startTransition] = useTransition();
	const { isGeneratingPRD, creditsExhausted, setCreditsExhausted } =
		useChatStore();

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
			navigate({ to: "/vibeplan/$id/prd", params: { id: newProjectId } });
		});
	};

	// ── Render ──

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-onyx text-snow">
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
					{/* Default: PRD content (streaming or saved). The canvas owns the
					    pre-token state itself: it shows a text skeleton, so no second
					    loading copy or spinner is rendered over the document here. */}
					<div className="flex flex-1 flex-col overflow-hidden relative">
						<PrdViewer
							content={streamingForView ? streamingForView : currentContent}
							plan={plan}
							versions={mappedVersions}
							currentVersion={selectedVersionNum}
							onSelectVersion={handleVersionSelect}
							isGenerating={isGeneratingPRD}
							className="flex-1 overflow-hidden"
						/>
						{plan === "free" && latestVersion && (
							<div className="shrink-0 border-t border-graphite bg-charcoal/40 px-4 py-3">
								<div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
									<p className="text-sm text-fog">
										Lanjut ke AC butuh Pro. Generate Acceptance Criteria hanya
										untuk paket Pro/Hengker.
									</p>
									<button
										type="button"
										onClick={() => openPaywallModal("ac")}
										className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-[510] transition-all hover:brightness-105 active:scale-[0.98]"
									>
										<span className="whitespace-nowrap">Upgrade ke Pro</span>
										<Icon icon={ArrowRight01Icon} size={12} />
									</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Mobile (<md) follows the Dokumen/Chat tab; md+ follows the store.
				    The panel stays laid out while closed so the toggle animates
				    instead of snapping: the tablet sheet slides up from the bottom,
				    and the desktop panel keeps its right edge pinned to the wall
				    while its width animates, so its left edge slides in from the
				    right and sinks back into it. `invisible` (not display:none)
				    keeps the closed panel out of the tab order and hit testing. */}
				<aside
					id={PRD_CHAT_PANEL_ID}
					aria-label="Chat PRD"
					data-state={isChatOpen ? "open" : "closed"}
					style={chatStyle}
					className={cn(
						"min-h-0 flex-1 flex-col overflow-hidden border-l border-graphite print:hidden",
						"md:fixed md:inset-x-0 md:bottom-0 md:z-40 md:flex md:h-[60vh] md:rounded-t-xl",
						"xl:relative xl:inset-auto xl:z-auto xl:h-auto xl:rounded-none xl:flex-none xl:translate-y-0",
						// Toggle animates; a manual drag must track the pointer with no
						// transition, or the panel lags one animation behind the cursor.
						!isDraggingRight &&
							"md:transition-[transform,visibility] md:duration-300 md:ease-out xl:transition-[width,visibility] xl:duration-300 xl:ease-out motion-reduce:transition-none",
						activeTab === "chat" ? "flex" : "hidden",
						isChatOpen
							? "md:visible md:translate-y-0 xl:w-[var(--chat-width)]"
							: "md:invisible md:translate-y-full xl:w-0",
					)}
				>
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:w-[var(--chat-width)]">
						<div className="hidden shrink-0 items-center justify-between border-b border-graphite px-4 py-2 md:flex xl:hidden">
							<span className="text-sm font-[510]">Chat</span>
							<button
								type="button"
								onClick={toggleChat}
								aria-label="Tutup chat"
								className="text-fog hover:text-snow"
							>
								<Icon icon={Cancel01Icon} size={16} />
							</button>
						</div>
						<ChatPanel
							projectId={projectId}
							conversationId={conversationId}
							onProjectCreated={handleProjectCreated}
							onPrdRevised={handlePrdRevised}
							className="min-h-0 flex-1 w-full border-none"
							enableAutoSubmit={true}
							inputDisabled={!projectId && !isGeneratingPRD}
							isReadOnly={isReadOnly}
							currentPrdContent={currentContent}
							userPlan={plan}
							selectedVersionNum={selectedVersionNum}
						/>
					</div>
					{isChatOpen && (
						<div
							aria-hidden="true"
							className="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize xl:block"
							onMouseDown={onStartDragRight}
						/>
					)}
				</aside>
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
