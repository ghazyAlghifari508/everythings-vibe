import {
	ArrowLeftDoubleIcon,
	BubbleChatIcon,
} from "@hugeicons/core-free-icons";
import * as Dialog from "@radix-ui/react-dialog";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useRef,
	useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { useStudioElementEditing } from "../../hooks/use-studio-element-editing";
import type { StudioWorkspaceState } from "../../hooks/use-studio-workspace";
import { studioChatPanelWidthCss } from "../../utils/studio-chat-layout";
import { StudioComposer } from "../composer/studio-composer";
import {
	StudioChatConversation,
	type StudioChatScrollMemory,
} from "./studio-chat-conversation";

const floatingControl =
	"flex size-11 shrink-0 items-center justify-center rounded-lg border border-iron/70 bg-charcoal/85 text-snow backdrop-blur-sm hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow supports-[backdrop-filter]:bg-charcoal/70";
const topBelowHeader = "top-[calc(4rem+env(safe-area-inset-top))]";

interface PanelProps {
	workspace: StudioWorkspaceState;
	desktop: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	draft: { prompt: string; setPrompt: Dispatch<SetStateAction<string>> };
	elementEditing?: ReturnType<typeof useStudioElementEditing>;
}

function PanelBody({
	workspace,
	onOpenChange,
	draft,
	elementEditing,
	expandedIds,
	onToggleExpanded,
	scrollMemory,
}: Omit<PanelProps, "desktop" | "open"> & {
	expandedIds: ReadonlySet<string>;
	onToggleExpanded: (id: string) => void;
	scrollMemory: StudioChatScrollMemory;
}) {
	return (
		<>
			<div className="flex h-12 shrink-0 items-center justify-between gap-2 pr-1.5 pl-4">
				<Icon
					icon={BubbleChatIcon}
					size={18}
					className="text-fog"
					aria-hidden="true"
				/>
				<button
					type="button"
					aria-label="Tutup panel chat"
					title="Tutup panel chat"
					onClick={() => onOpenChange(false)}
					className="flex size-11 items-center justify-center rounded-lg text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
				>
					<Icon icon={ArrowLeftDoubleIcon} size={18} />
				</button>
			</div>
			<StudioChatConversation
				messages={workspace.messages}
				expandedIds={expandedIds}
				onToggleExpanded={onToggleExpanded}
				scrollMemory={scrollMemory}
			/>
			{elementEditing?.undo && !elementEditing.preview ? (
				<div className="mx-3 flex items-center justify-between gap-2 border-t border-iron px-1 py-2 text-xs text-fog">
					<span className="min-w-0 truncate">
						{elementEditing.undo.frameName}: revisi diterapkan
					</span>
					<button
						type="button"
						disabled={elementEditing.busy}
						onClick={() =>
							elementEditing.undo &&
							void elementEditing.transition(elementEditing.undo, "undo")
						}
						className="min-h-11 rounded-md px-3 text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-snow disabled:opacity-40"
					>
						Undo
					</button>
				</div>
			) : null}
			{elementEditing?.error && !elementEditing.preview ? (
				<p role="alert" className="px-4 py-2 text-xs text-crimson">
					{elementEditing.error}
				</p>
			) : null}
			{workspace.error ? (
				<div
					role="alert"
					className="mx-3 flex shrink-0 items-center gap-2 border-t border-iron px-1 text-xs text-crimson"
				>
					<p className="min-w-0 flex-1 break-words">{workspace.error}</p>
					<button
						type="button"
						aria-label="Tutup pesan error"
						onClick={() => workspace.setError("")}
						className="min-h-11 shrink-0 rounded px-2 text-xs hover:bg-steel focus-visible:outline-2 focus-visible:outline-snow"
					>
						Tutup
					</button>
				</div>
			) : null}
			<div className="shrink-0 px-3 pt-2 pb-3">
				<StudioComposer
					value={draft.prompt}
					elementTarget={elementEditing?.target}
					onRemoveElement={elementEditing?.clearTarget}
					onValueChange={draft.setPrompt}
					selectedFrames={workspace.selectedFrames}
					onRemoveFrame={workspace.removeSelectedFrame}
					onClearFrames={workspace.clearSelectedFrames}
					onSubmit={
						elementEditing?.target
							? elementEditing.submit
							: workspace.handleComposerSubmit
					}
					loading={
						workspace.composerLoading ||
						elementEditing?.busy ||
						Boolean(elementEditing?.preview)
					}
					suggestions={workspace.suggestions}
					referenceLabel={workspace.storedReferenceLabel}
					referenceColors={workspace.storedReferenceColors}
				/>
			</div>
		</>
	);
}

/**
 * Floating AI conversation. On desktop the panel stays mounted while collapsed
 * (hidden and inert), so the composer draft, attachments, scroll position and
 * expanded prompts survive a toggle. Below the desktop breakpoint it becomes a
 * modal drawer; its state still lives here, above the unmounting dialog.
 */
export function StudioChatPanel({
	workspace,
	desktop,
	open,
	onOpenChange,
	draft,
	elementEditing,
}: PanelProps) {
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const scrollMemory = useRef({ top: 0, following: true });
	const toggleExpanded = useCallback((id: string) => {
		setExpandedIds((current) => {
			const next = new Set(current);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	}, []);
	const body = (
		<PanelBody
			workspace={workspace}
			onOpenChange={onOpenChange}
			draft={draft}
			elementEditing={elementEditing}
			expandedIds={expandedIds}
			onToggleExpanded={toggleExpanded}
			scrollMemory={scrollMemory}
		/>
	);
	return (
		<>
			{open ? null : (
				<button
					id="studio-chat-toggle"
					type="button"
					aria-label="Buka panel chat"
					title="Buka panel chat"
					aria-expanded={false}
					onClick={() => onOpenChange(true)}
					className={cn(
						"absolute left-3 z-20",
						topBelowHeader,
						floatingControl,
					)}
				>
					<Icon icon={BubbleChatIcon} size={18} />
				</button>
			)}
			{desktop ? (
				<aside
					aria-label="Design agent"
					aria-hidden={!open}
					inert={!open}
					style={{ width: studioChatPanelWidthCss() }}
					className={cn(
						"absolute bottom-3 left-3 z-20 flex min-h-0 flex-col overflow-hidden rounded-xl border border-iron/70 bg-obsidian/95 backdrop-blur-sm transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none",
						topBelowHeader,
						open
							? "visible translate-x-0 opacity-100"
							: "pointer-events-none invisible -translate-x-3 opacity-0",
					)}
				>
					{body}
				</aside>
			) : (
				<Dialog.Root open={open} onOpenChange={onOpenChange}>
					<Dialog.Portal>
						<Dialog.Overlay className="studio-chat-scrim fixed inset-0 z-40 bg-black/60" />
						<Dialog.Content
							onCloseAutoFocus={(event) => {
								event.preventDefault();
								document.getElementById("studio-chat-toggle")?.focus();
							}}
							className="studio-chat-drawer fixed top-[calc(0.5rem+env(safe-area-inset-top))] bottom-2 left-2 z-50 flex w-[calc(100%-1rem)] max-w-md flex-col overflow-hidden rounded-xl border border-iron/70 bg-obsidian text-snow outline-none"
						>
							<Dialog.Title className="sr-only">Design agent</Dialog.Title>
							<Dialog.Description className="sr-only">
								Percakapan dan instruksi desain untuk project ini.
							</Dialog.Description>
							{body}
						</Dialog.Content>
					</Dialog.Portal>
				</Dialog.Root>
			)}
		</>
	);
}
