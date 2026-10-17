"use client";

export function TypingIndicator() {
	return (
		<div className="flex items-center gap-2 px-1 py-3">
			<div className="flex gap-1.5 rounded-2xl rounded-bl-md bg-obsidian px-3 py-2">
				<span className="h-2 w-2 rounded-full bg-fog/40 animate-typing-dot" />
				<span className="h-2 w-2 rounded-full bg-fog/40 animate-typing-dot [animation-delay:0.2s]" />
				<span className="h-2 w-2 rounded-full bg-fog/40 animate-typing-dot [animation-delay:0.4s]" />
			</div>
		</div>
	);
}
