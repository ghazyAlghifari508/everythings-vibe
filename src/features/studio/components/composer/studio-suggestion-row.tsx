"use client";

import {
	Add01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
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

export function formatSuggestionLabel(suggestion: {
	title: string;
	label?: string;
}): string {
	if (suggestion.label?.trim()) {
		return suggestion.label.trim();
	}
	const title = suggestion.title.trim();
	const stripped = title
		.replace(
			/^(buat|rancang|atur|susun|lacak status|tambahkan|tetapkan)\s+(halaman\s+)?/i,
			"",
		)
		.trim();
	if (stripped) {
		return stripped.charAt(0).toUpperCase() + stripped.slice(1);
	}
	return title;
}

/**
 * Compact horizontal row of next-screen bubbles above the composer. Each bubble
 * displays a concise title while preserving the full contextual prompt on selection.
 * Selecting a bubble only fills the composer; submission stays the user's decision.
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
		const firstPill = listRef.current?.querySelector("li");
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
		"inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-iron bg-obsidian text-fog transition-colors hover:border-snow hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:cursor-not-allowed disabled:opacity-30";
	const scrollable = canPrev || canNext;

	return (
		<div
			data-testid="studio-suggestion-row"
			className="mb-2 flex w-full items-center gap-1.5"
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
				aria-label="Saran layar berikutnya"
				onScroll={refreshDirections}
				className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<ul ref={listRef} className="flex items-center gap-1.5">
					{suggestions.map((suggestion) => {
						const isNav = Boolean(
							suggestion.reason?.toLowerCase().includes("navigasi") ||
								suggestion.description?.toLowerCase().includes("destinasi"),
						);
						const displayLabel =
							suggestion.label ?? formatSuggestionLabel(suggestion);

						return (
							<li key={suggestion.id} className="shrink-0">
								<button
									type="button"
									disabled={disabled}
									onClick={() => onSelect(suggestion)}
									onKeyDown={moveFocus}
									title={suggestion.prompt}
									aria-label={suggestion.title}
									className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-iron bg-obsidian px-3 text-xs text-mist transition-all duration-150 hover:border-snow hover:bg-steel/30 hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
								>
									<Icon
										icon={Add01Icon}
										size={13}
										className="shrink-0 text-fog transition-colors group-hover:text-snow"
										aria-hidden="true"
									/>
									<span className="truncate">{displayLabel}</span>
									{isNav ? (
										<Icon
											icon={ArrowRight01Icon}
											size={12}
											className="shrink-0 text-fog/70 transition-colors group-hover:text-snow"
											aria-hidden="true"
										/>
									) : null}
									<span className="sr-only">
										{" "}
										— {suggestion.description} — {suggestion.prompt}
									</span>
								</button>
							</li>
						);
					})}
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
