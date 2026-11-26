import { Spinner } from "@/components/ui/spinner";
import type { ChatMessage } from "@/store";
import { ChatBubble } from "./chat-bubble";
import { ChatStreamStatus } from "./chat-stream-status";

export interface ChatMessageListProps {
	messages: ChatMessage[];
	isStreaming: boolean;
	streamingContent: string;
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

			{isStreaming && streamingContent && (
				// biome-ignore lint/a11y/useValidAriaRole: role is the chat-message domain prop, never rendered to the DOM (see chat-bubble.tsx)
				<ChatBubble role="assistant" content={streamingContent} isStreaming />
			)}

			{/* Document generation uses the real section checklist above. Every
			    other pending reply gets ONE compact status, never raw reasoning
			    or blinking dots. */}
			{isStreaming && !streamingContent && (!isGeneratingPRD || isRevising) && (
				<output className="flex items-center gap-2 px-1 py-3 text-xs text-fog">
					<Spinner size={14} />
					<span>
						{isRevising ? "Menyusun revisi..." : "Menunggu balasan..."}
					</span>
				</output>
			)}
		</div>
	);
}
