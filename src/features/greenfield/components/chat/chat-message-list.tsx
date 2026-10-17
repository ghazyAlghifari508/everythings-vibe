import type { ChatMessage } from "@/store";
import { ChatBubble } from "./chat-bubble";
import { ChatStreamStatus } from "./chat-stream-status";
import { TypingIndicator } from "./typing-indicator";

export interface ChatMessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	streamingContent: string;
	thinkingText: string;
	currentSection: string | null;
	completedSections: string[];
	isGeneratingPRD: boolean;
	isRevising: boolean;
	scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessageList({
	messages,
	isStreaming,
	streamingContent,
	thinkingText,
	currentSection,
	completedSections,
	isGeneratingPRD,
	isRevising,
	scrollRef,
}: ChatMessageListProps) {
	return (
		<div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
			<ChatStreamStatus
				currentSection={currentSection}
				completedSections={completedSections}
				isGeneratingPRD={isGeneratingPRD}
				isRevising={isRevising}
			/>

			{messages.map((msg) => (
				<ChatBubble key={msg.id} role={msg.role} content={msg.content} />
			))}

			{isStreaming && thinkingText && !streamingContent && (
				<details className="mb-2 px-4 text-xs text-fog/60" open>
					<summary className="cursor-pointer select-none">
						AI sedang berpikir...
					</summary>
					<pre className="custom-scrollbar mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-fog/40">
						{thinkingText}
					</pre>
				</details>
			)}

			{isStreaming && streamingContent && (
				// biome-ignore lint/a11y/useValidAriaRole: role is the chat-message domain prop, never rendered to the DOM (see chat-bubble.tsx)
				<ChatBubble role="assistant" content={streamingContent} isStreaming />
			)}

			{isStreaming && !streamingContent && !thinkingText && <TypingIndicator />}
		</div>
	);
}
