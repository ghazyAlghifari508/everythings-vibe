"use client";

import {
	Add01Icon,
	Alert02Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Edit02Icon,
	LayersIcon,
	WorkflowIcon,
} from "@hugeicons/core-free-icons";
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

function iconForIntent(intent: StudioScreenSuggestion["intent"]) {
	switch (intent) {
		case "add_screen":
			return Add01Icon;
		case "add_state":
			return LayersIcon;
		case "add_validation":
			return Alert02Icon;
		case "complete_flow":
			return WorkflowIcon;
		default:
			return Edit02Icon;
	}
}

/**
 * Horizontal action cards above the composer. Each card shows a full sentence
 * and the concrete benefit, never a generic shortcut pill. Selecting one fills
 * the composer with the complete editable prompt; submission stays the user's
 * decision, so no card click charges a credit.
 */
export function StudioSuggestionRow({
	suggestions,
	onSelect,
	disabled = false,
}: StudioSuggestionRowProps) {
	const viewportRef = useRef<HTMLElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
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
		const list = listRef.current;
		if (list) observer.observe(list);
		return () => observer.disconnect();
	}, [refreshDirections]);

	const scrollOneStep = useCallback((direction: 1 | -1) => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const firstCard = listRef.current?.querySelector("li");
		const cardWidth =
			firstCard instanceof HTMLElement
				? firstCard.getBoundingClientRect().width
				: 0;
		viewport.scrollBy({
			left:
				direction *
				getCarouselStep(
					cardWidth,
					SHORTCUT_CAROUSEL_GAP_FALLBACK_PX,
					viewport.clientWidth,
				),
			behavior: "smooth",
		});
	}, []);

	const moveFocus = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
		const delta =
			event.key === "ArrowRight" || event.key === "ArrowDown"
				? 1
				: event.key === "ArrowLeft" || event.key === "ArrowUp"
					? -1
					: 0;
		if (delta === 0) return;
		const buttons = Array.from(
			listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
		);
		const current = buttons.indexOf(event.currentTarget);
		if (current < 0 || buttons.length === 0) return;
		event.preventDefault();
		const next = buttons[(current + delta + buttons.length) % buttons.length];
		next?.focus();
	}, []);

	if (suggestions.length === 0) return null;

	const arrowClass =
		"inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-iron bg-obsidian text-fog transition-colors hover:border-snow hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-30 lg:size-6";
	const scrollable = canPrev || canNext;

	return (
		<div
			data-testid="studio-suggestion-row"
			className="mb-2 flex w-full items-stretch gap-1.5"
		>
			{scrollable ? (
				<button
					type="button"
					aria-label="Geser saran ke kiri"
					disabled={!canPrev}
					onClick={() => scrollOneStep(-1)}
					className={arrowClass}
				>
					<Icon icon={ArrowLeft01Icon} size={12} aria-hidden="true" />
				</button>
			) : null}
			<section
				ref={viewportRef}
				aria-label="Saran aksi berikutnya"
				onScroll={refreshDirections}
				className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<ul ref={listRef} className="flex items-stretch gap-2">
					{suggestions.map((suggestion) => (
						<li key={suggestion.id} className="shrink-0">
							<button
								type="button"
								disabled={disabled}
								onClick={() => onSelect(suggestion)}
								onKeyDown={moveFocus}
								title={suggestion.prompt}
								aria-label={suggestion.cardCopy}
								className="flex h-full min-h-16 w-52 flex-col items-start gap-1 rounded-lg border border-iron bg-obsidian px-3 py-2.5 text-left transition-colors hover:border-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-40"
							>
								<Icon
									icon={iconForIntent(suggestion.intent)}
									size={14}
									className="shrink-0 text-mist"
									aria-hidden="true"
								/>
								<span className="text-xs leading-snug text-snow">
									{suggestion.cardCopy}
								</span>
								<span className="line-clamp-2 text-[11px] leading-snug text-fog">
									{suggestion.description}
								</span>
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
					<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
				</button>
			) : null}
		</div>
	);
}
