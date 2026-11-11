import { ScrollShadow } from "@heroui/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import * as Dialog from "@radix-ui/react-dialog";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { StudioWorkspaceState } from "../../hooks/use-studio-workspace";
import type { StudioMessageStatus } from "../../types/studio-conversation";
import { StudioComposer } from "../composer/studio-composer";

const statusLabels: Record<StudioMessageStatus, string> = {
	accepted: "Diterima",
	queued: "Dalam antrean",
	planning: "Menyusun rencana",
	generating: "Membuat desain",
	completed: "Selesai",
	partial: "Sebagian tersedia",
	failed: "Belum berhasil",
};

function Conversation({ workspace }: { workspace: StudioWorkspaceState }) {
	const viewport = useRef<HTMLDivElement>(null);
	const following = useRef(true);
	useEffect(() => {
		if (!workspace.messages.length) return;
		if (following.current && viewport.current)
			viewport.current.scrollTop = viewport.current.scrollHeight;
	}, [workspace.messages]);
	return (
		<ScrollShadow
			ref={viewport}
			role="log"
			aria-label="Percakapan desain"
			aria-live="polite"
			aria-relevant="additions text"
			tabIndex={0}
			className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-snow"
			onScroll={(event) => {
				const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
				following.current = scrollHeight - scrollTop - clientHeight < 48;
			}}
		>
			{workspace.messages.length === 0 ? (
				<p className="text-sm leading-relaxed text-fog">
					Percakapan desain akan tersimpan di project ini. Pilih layar untuk
					revisi atau minta halaman baru.
				</p>
			) : (
				workspace.messages.map((message) => (
					<article key={message.id} className="mb-6 min-w-0 last:mb-0">
						<div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fog">
							<span className="font-medium text-snow">
								{message.role === "user" ? "Anda" : "Design agent"}
							</span>
							{message.role === "assistant" &&
							(message.status === "planning" ||
								message.status === "generating") ? (
								<Spinner size={12} />
							) : null}
							<span>{statusLabels[message.status]}</span>
						</div>
						<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-snow [overflow-wrap:anywhere]">
							{message.content}
						</p>
						{message.attachments.length > 0 ? (
							<ul
								aria-label="Layar terkait"
								className="mt-2 flex flex-wrap gap-1.5"
							>
								{message.attachments.map((attachment) => (
									<li
										key={attachment.frameId}
										className="max-w-full truncate rounded-md border border-iron px-2 py-1 text-xs text-fog"
										title={attachment.name}
									>
										{attachment.name}
									</li>
								))}
							</ul>
						) : null}
					</article>
				))
			)}
		</ScrollShadow>
	);
}

export function StudioChatPanel({
	workspace,
	desktop,
	open,
	onOpenChange,
	draft,
}: {
	workspace: StudioWorkspaceState;
	desktop: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	draft: { prompt: string; setPrompt: Dispatch<SetStateAction<string>> };
}) {
	const content = (
		<>
			<div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-iron px-4">
				<span className="text-xs font-medium tracking-wide text-fog">
					DESIGN AGENT
				</span>
				{!desktop ? (
					<Dialog.Close
						aria-label="Kembali ke canvas"
						className="flex size-11 items-center justify-center rounded-lg text-fog hover:bg-steel hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
					>
						<Icon icon={ArrowLeft01Icon} size={18} />
					</Dialog.Close>
				) : null}
			</div>
			<Conversation workspace={workspace} />
			{workspace.error ? (
				<div
					role="alert"
					className="flex shrink-0 items-center gap-2 border-t border-iron px-4 text-xs text-crimson"
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
			<div className="shrink-0 border-t border-iron px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
				<StudioComposer
					value={draft.prompt}
					onValueChange={draft.setPrompt}
					selectedFrames={workspace.selectedFrames}
					onRemoveFrame={workspace.removeSelectedFrame}
					onClearFrames={workspace.clearSelectedFrames}
					onSubmit={workspace.handleComposerSubmit}
					loading={workspace.composerLoading}
					suggestions={workspace.suggestions}
					referenceLabel={workspace.storedReferenceLabel}
					referenceColors={workspace.storedReferenceColors}
				/>
			</div>
		</>
	);
	if (desktop)
		return open ? (
			<aside
				aria-label="Design agent"
				className="flex min-h-0 w-[clamp(18rem,28vw,24rem)] shrink-0 flex-col border-r border-iron bg-obsidian"
			>
				{content}
			</aside>
		) : null;
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
				<Dialog.Content
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						document.getElementById("studio-chat-toggle")?.focus();
					}}
					className="fixed inset-y-0 left-0 z-50 flex h-dvh w-full max-w-md flex-col overflow-hidden border-r border-iron bg-obsidian pt-[env(safe-area-inset-top)] text-snow outline-none"
				>
					<Dialog.Title className="sr-only">Design agent</Dialog.Title>
					<Dialog.Description className="sr-only">
						Percakapan dan instruksi desain untuk project ini.
					</Dialog.Description>
					{content}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
