"use client";

import { ArrowTurnForwardIcon } from "@hugeicons/core-free-icons";
import type { KeyboardEvent } from "react";
import { useCallback, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioScreenSuggestion } from "@/features/studio/services/studio-screen-suggestions";

interface StudioSuggestionRowProps {
	suggestions: readonly StudioScreenSuggestion[];
	onSelect: (suggestion: StudioScreenSuggestion) => void;
	disabled?: boolean;
}

/**
 * Compact stack of next-screen cards above the composer. Each card names what
 * to design next and what it gives the user; selecting one only inserts its
 * prompt, and submission stays the user's decision.
 */
export function StudioSuggestionRow({
	suggestions,
	onSelect,
	disabled = false,
}: StudioSuggestionRowProps) {
	const listRef = useRef<HTMLUListElement>(null);

	const moveFocus = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
		const delta =
			event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (delta === 0) return;
		const cards = Array.from(
			listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
		);
		const current = cards.indexOf(event.currentTarget);
		if (current < 0 || cards.length === 0) return;
		event.preventDefault();
		cards[(current + delta + cards.length) % cards.length]?.focus();
	}, []);

	if (suggestions.length === 0) return null;

	return (
		<section
			data-testid="studio-suggestion-row"
			aria-label="Saran layar berikutnya"
			className="mb-2 overflow-hidden rounded-xl border border-iron bg-obsidian"
		>
			<ul ref={listRef} className="divide-y divide-iron">
				{suggestions.map((suggestion) => (
					<li key={suggestion.id}>
						<button
							type="button"
							disabled={disabled}
							onClick={() => onSelect(suggestion)}
							onKeyDown={moveFocus}
							// Pointer users read the full prompt on hover; keyboard and
							// screen-reader users get the same text from inside the card.
							title={suggestion.prompt}
							className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-steel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
						>
							<Icon
								icon={ArrowTurnForwardIcon}
								size={14}
								className="mt-0.5 shrink-0 text-fog"
								aria-hidden
							/>
							<span className="min-w-0 flex-1">
								<span className="block text-xs leading-5 text-snow">
									{suggestion.title}
								</span>
								<span className="block text-[11px] leading-4 text-fog">
									{suggestion.description}
								</span>
							</span>
							<span className="sr-only"> — {suggestion.prompt}</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
