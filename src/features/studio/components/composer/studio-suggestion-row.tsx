"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioScreenSuggestion } from "@/features/studio/services/studio-screen-suggestions";
import {
	type CarouselScrollMetrics,
	canScrollNext,
	canScrollPrev,
	getCarouselStep,
	SHORTCUT_CAROUSEL_GAP_FALLBACK_PX,
} from "@/features/studio/utils/studio-shortcut-carousel-state";

interface StudioSuggestionRowProps {
	suggestions: readonly StudioScreenSuggestion[];
	onSelect: (suggestion: StudioScreenSuggestion) => void;
	disabled?: boolean;
}

function readMetrics(viewport: HTMLElement): CarouselScrollMetrics {
	return {
		scrollLeft: viewport.scrollLeft,
		scrollWidth: viewport.scrollWidth,
		clientWidth: viewport.clientWidth,
	};
}

/**
 * One scrollable row of next-screen bubbles above the composer. Selecting a
 * bubble only inserts its prompt; submission stays the user's decision.
 */
export function StudioSuggestionRow({
	suggestions,
	onSelect,
	disabled = false,
}: StudioSuggestionRowProps) {
	const viewportRef = useRef<HTMLElement>(null);
	const [canPrev, setCanPrev] = useState(false);
	const [canNext, setCanNext] = useState(false);

	const refreshDirections = useCallback(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const metrics = readMetrics(viewport);
		setCanPrev(canScrollPrev(metrics));
		setCanNext(canScrollNext(metrics));
	}, []);

	useEffect(() => {
		refreshDirections();
		const viewport = viewportRef.current;
		if (!viewport || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => refreshDirections());
		observer.observe(viewport);
		// New bubbles change the list width without resizing the viewport, so the
		// content box is observed too instead of only the scroll frame.
		const list = viewport.querySelector("ul");
		if (list) observer.observe(list);
		return () => observer.disconnect();
	}, [refreshDirections]);

	const scrollOneStep = useCallback((direction: 1 | -1) => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const firstPill = viewport.querySelector("ul > li");
		const pillWidth =
			firstPill instanceof HTMLElement
				? firstPill.getBoundingClientRect().width
				: 0;
		viewport.scrollBy({
			left:
				direction *
				getCarouselStep(
					pillWidth,
					SHORTCUT_CAROUSEL_GAP_FALLBACK_PX,
					viewport.clientWidth,
				),
			behavior: "smooth",
		});
	}, []);

	const moveFocus = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
		const delta =
			event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
		if (delta === 0) return;
		const viewport = viewportRef.current;
		if (!viewport) return;
		const pills = Array.from(
			viewport.querySelectorAll<HTMLButtonElement>("ul > li > button"),
		);
		const current = pills.indexOf(event.currentTarget);
		if (current < 0) return;
		event.preventDefault();
		pills[(current + delta + pills.length) % pills.length]?.focus();
	}, []);

	const arrowClass =
		"inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-iron bg-obsidian text-fog transition-colors hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40";
	// A row that fits needs no controls, so the arrows only appear once the
	// bubbles actually overflow.
	const scrollable = canPrev || canNext;

	return (
		<div
			data-testid="studio-suggestion-row"
			className="mb-2 flex items-center gap-1.5"
		>
			{scrollable ? (
				<button
					type="button"
					aria-label="Geser saran ke kiri"
					disabled={!canPrev}
					onClick={() => scrollOneStep(-1)}
					className={arrowClass}
				>
					<Icon icon={ArrowLeft01Icon} size={14} />
				</button>
			) : null}
			<section
				ref={viewportRef}
				aria-label="Saran layar berikutnya"
				onScroll={refreshDirections}
				className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<ul className="flex gap-1.5">
					{suggestions.map((suggestion) => (
						<li key={suggestion.id} className="shrink-0">
							<button
								type="button"
								disabled={disabled}
								onClick={() => onSelect(suggestion)}
								onKeyDown={moveFocus}
								// Pointer users get the full prompt on hover; keyboard and
								// screen-reader users get it from the text inside the button.
								title={suggestion.prompt}
								className="flex max-w-52 items-center rounded-full border border-iron bg-obsidian px-3 py-1.5 text-xs text-mist transition-colors hover:border-snow hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
							>
								<span className="min-w-0 truncate">{suggestion.label}</span>
								<span className="sr-only"> — {suggestion.prompt}</span>
							</button>
						</li>
					))}
				</ul>
			</section>
			{scrollable ? (
				<button
					type="button"
					aria-label="Geser saran ke kanan"
					disabled={!canNext}
					onClick={() => scrollOneStep(1)}
					className={arrowClass}
				>
					<Icon icon={ArrowRight01Icon} size={14} />
				</button>
			) : null}
		</div>
	);
}
