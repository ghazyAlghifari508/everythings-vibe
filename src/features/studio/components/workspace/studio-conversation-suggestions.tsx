"use client";

import { CornerDownRightIcon } from "@hugeicons/core-free-icons";
import type { KeyboardEvent } from "react";
import { useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioScreenSuggestion } from "../../services/studio-screen-suggestions";

interface StudioConversationSuggestionsProps {
	suggestions: readonly StudioScreenSuggestion[];
	onSelect: (suggestion: StudioScreenSuggestion) => void;
	disabled?: boolean;
}

/**
 * Next steps for one finished assistant result. The list lives in the
 * conversation flow beside that result, never as a floating composer carousel.
 * Selecting a row fills the editable composer; it never submits or charges.
 */
export function StudioConversationSuggestions({
	suggestions,
	onSelect,
	disabled = false,
}: StudioConversationSuggestionsProps) {
	const listRef = useRef<HTMLUListElement>(null);
	if (suggestions.length === 0) return null;

	const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
		const delta =
			event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (delta === 0) return;
		const buttons = Array.from(
			listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
		);
		const current = buttons.indexOf(event.currentTarget);
		const next = buttons[current + delta];
		if (!next) return;
		event.preventDefault();
		next.focus();
	};

	return (
		<section
			aria-label="Saran langkah berikutnya"
			data-testid="studio-suggestion-row"
			className="mt-3 border-t border-iron/60 pt-3"
		>
			<ul ref={listRef} className="flex flex-col gap-1.5">
				{suggestions.map((suggestion) => (
					<li key={suggestion.id} className="min-w-0">
						<button
							type="button"
							disabled={disabled}
							onClick={() => onSelect(suggestion)}
							onKeyDown={moveFocus}
							title={suggestion.prompt}
							aria-label={suggestion.cardCopy}
							className="flex w-full items-start gap-2.5 rounded-lg border border-iron/60 bg-obsidian/70 px-2.5 py-2 text-left text-sm leading-relaxed text-fog transition-colors hover:border-iron hover:bg-steel/20 hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
						>
							<Icon
								icon={CornerDownRightIcon}
								size={16}
								className="mt-0.5 shrink-0 text-mist"
								aria-hidden="true"
								data-suggestion-icon="curved-arrow"
							/>
							<span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
								{suggestion.cardCopy}
							</span>
							<span className="sr-only"> — {suggestion.prompt}</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
