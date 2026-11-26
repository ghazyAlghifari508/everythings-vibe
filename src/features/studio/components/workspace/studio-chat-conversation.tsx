import { ScrollShadow } from "@heroui/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { type MutableRefObject, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioFrameRow, StudioMessageRow } from "@/db/schema";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { cn } from "@/lib/utils";
import type { StudioScreenSuggestion } from "../../services/studio-screen-suggestions";
import { isLongStudioUserMessage } from "../../utils/studio-chat-message";
import { StudioChatMarkdown } from "./studio-chat-markdown";
import { StudioChatResult } from "./studio-chat-result";
import { StudioConversationSuggestions } from "./studio-conversation-suggestions";

/** Scroll position lives above the conversation so a remounted drawer reopens where it was. */
export type StudioChatScrollMemory = MutableRefObject<{
	top: number;
	following: boolean;
}>;

interface ConversationProps {
	messages: StudioMessageRow[];
	frames: readonly StudioFrameRow[];
	onOpenFrame: (frameId: string) => void;
	expandedIds: ReadonlySet<string>;
	onToggleExpanded: (id: string) => void;
	scrollMemory: StudioChatScrollMemory;
	suggestionsByMessage: ReadonlyMap<string, readonly StudioScreenSuggestion[]>;
	onSelectSuggestion: (suggestion: StudioScreenSuggestion) => void;
	suggestionsDisabled?: boolean;
}

function Attachments({ message }: { message: StudioMessageRow }) {
	if (!message.attachments.length) return null;
	return (
		<ul
			aria-label="Layar terkait"
			className="flex flex-wrap justify-end gap-1.5"
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
	);
}

function UserBubble({
	message,
	expanded,
	onToggle,
}: {
	message: StudioMessageRow;
	expanded: boolean;
	onToggle: () => void;
}) {
	const long = isLongStudioUserMessage(message.content);
	const bodyId = `studio-message-${message.id}`;
	return (
		<article
			aria-label="Pesan Anda"
			className="flex min-w-0 flex-col items-end gap-1.5"
		>
			<div className="max-w-[88%] min-w-0 rounded-xl rounded-br-sm bg-steel px-3.5 py-2.5 text-sm leading-relaxed text-snow">
				<p
					id={bodyId}
					className={cn(
						"whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
						long && !expanded && "line-clamp-4",
					)}
				>
					{message.content}
				</p>
				{long ? (
					<button
						type="button"
						aria-expanded={expanded}
						aria-controls={bodyId}
						aria-label={expanded ? "Ciutkan pesan" : "Tampilkan seluruh pesan"}
						onClick={onToggle}
						className="-mr-2.5 -mb-2.5 ml-auto flex size-11 items-center justify-center rounded-lg text-fog hover:text-snow focus-visible:outline-2 focus-visible:outline-snow"
					>
						<Icon icon={expanded ? ArrowUp01Icon : ArrowDown01Icon} size={16} />
					</button>
				) : null}
			</div>
			<Attachments message={message} />
		</article>
	);
}

function AssistantMessage({
	message,
	frames,
	onOpenFrame,
	suggestions,
	onSelectSuggestion,
	disabled,
}: {
	message: StudioMessageRow;
	frames: readonly StudioFrameRow[];
	onOpenFrame: (frameId: string) => void;
	suggestions: readonly StudioScreenSuggestion[];
	onSelectSuggestion: (suggestion: StudioScreenSuggestion) => void;
	disabled: boolean;
}) {
	return (
		<article aria-label="Balasan design agent" className="min-w-0">
			{message.content.trim() ? (
				<StudioChatMarkdown content={message.content} />
			) : null}
			<StudioChatResult
				message={message}
				frames={frames}
				onOpenFrame={onOpenFrame}
			/>
			<StudioConversationSuggestions
				suggestions={suggestions}
				onSelect={onSelectSuggestion}
				disabled={disabled}
			/>
		</article>
	);
}

export function StudioChatConversation({
	messages,
	frames,
	onOpenFrame,
	expandedIds,
	onToggleExpanded,
	scrollMemory,
	suggestionsByMessage,
	onSelectSuggestion,
	suggestionsDisabled = false,
}: ConversationProps) {
	const viewport = useRef<HTMLDivElement>(null);
	useIsomorphicLayoutEffect(() => {
		const element = viewport.current;
		if (element && !scrollMemory.current.following)
			element.scrollTop = scrollMemory.current.top;
	}, [scrollMemory]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new message list is the signal to follow the tail
	useEffect(() => {
		if (scrollMemory.current.following && viewport.current)
			viewport.current.scrollTop = viewport.current.scrollHeight;
	}, [messages, scrollMemory]);
	return (
		<ScrollShadow
			ref={viewport}
			role="log"
			aria-label="Percakapan desain"
			aria-live="polite"
			aria-relevant="additions text"
			tabIndex={0}
			className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-snow"
			onScroll={(event) => {
				const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
				scrollMemory.current = {
					top: scrollTop,
					following: scrollHeight - scrollTop - clientHeight < 48,
				};
			}}
		>
			{messages.length === 0 ? (
				<p className="text-sm leading-relaxed text-fog">
					Percakapan desain akan tersimpan di project ini. Pilih layar untuk
					revisi atau minta halaman baru.
				</p>
			) : (
				<div className="flex flex-col gap-5">
					{messages.map((message) =>
						message.role === "user" ? (
							<UserBubble
								key={message.id}
								message={message}
								expanded={expandedIds.has(message.id)}
								onToggle={() => onToggleExpanded(message.id)}
							/>
						) : (
							<AssistantMessage
								key={message.id}
								message={message}
								frames={frames}
								onOpenFrame={onOpenFrame}
								suggestions={suggestionsByMessage.get(message.id) ?? []}
								onSelectSuggestion={onSelectSuggestion}
								disabled={suggestionsDisabled}
							/>
						),
					)}
				</div>
			)}
		</ScrollShadow>
	);
}
