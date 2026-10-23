"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { StudioPromptShortcut } from "@/features/studio/services/studio-prompt-shortcuts";
import {
	type CarouselScrollMetrics,
	canScrollNext,
	canScrollPrev,
	getCarouselStep,
	SHORTCUT_CAROUSEL_GAP_FALLBACK_PX,
} from "@/features/studio/utils/studio-shortcut-carousel-state";
import { cn } from "@/lib/utils";

interface StudioShortcutCarouselProps {
	shortcuts: readonly StudioPromptShortcut[];
	onSelect: (shortcut: StudioPromptShortcut) => void;
	selectedId?: string | null;
}

function readMetrics(viewport: HTMLElement): CarouselScrollMetrics {
	return {
		scrollLeft: viewport.scrollLeft,
		scrollWidth: viewport.scrollWidth,
		clientWidth: viewport.clientWidth,
	};
}

function readGapWidth(list: HTMLElement | null): number {
	if (!list) return SHORTCUT_CAROUSEL_GAP_FALLBACK_PX;
	const parsed = Number.parseFloat(getComputedStyle(list).columnGap);
	if (!Number.isFinite(parsed) || parsed < 0)
		return SHORTCUT_CAROUSEL_GAP_FALLBACK_PX;
	return parsed;
}

export function StudioShortcutCarousel({
	shortcuts,
	onSelect,
	selectedId = null,
}: StudioShortcutCarouselProps) {
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
		return () => observer.disconnect();
	}, [refreshDirections]);

	const scrollOneStep = useCallback((direction: 1 | -1) => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const firstCard = viewport.querySelector("ul > li");
		const cardWidth =
			firstCard instanceof HTMLElement
				? firstCard.getBoundingClientRect().width
				: 0;
		const list = viewport.querySelector("ul");
		const step = getCarouselStep(
			cardWidth,
			readGapWidth(list instanceof HTMLElement ? list : null),
			viewport.clientWidth,
		);
		viewport.scrollBy({ left: direction * step, behavior: "smooth" });
	}, []);

	return (
		<section aria-label="Brief siap pakai" className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-sm font-semibold text-snow">
					Mulai dari brief siap pakai
				</h2>
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						aria-label="Brief sebelumnya"
						aria-disabled={!canPrev}
						disabled={!canPrev}
						onClick={() => scrollOneStep(-1)}
						className="inline-flex size-8 items-center justify-center rounded-full border border-graphite bg-charcoal text-fog transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Icon icon={ArrowLeft01Icon} size={16} />
					</button>
					<button
						type="button"
						aria-label="Brief berikutnya"
						aria-disabled={!canNext}
						disabled={!canNext}
						onClick={() => scrollOneStep(1)}
						className="inline-flex size-8 items-center justify-center rounded-full border border-graphite bg-charcoal text-fog transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Icon icon={ArrowRight01Icon} size={16} />
					</button>
				</div>
			</div>
			<section
				ref={viewportRef}
				aria-roledescription="carousel"
				aria-label="Daftar brief siap pakai"
				onScroll={refreshDirections}
				className="snap-x snap-proximity overflow-x-auto scroll-smooth py-1 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo [&::-webkit-scrollbar]:hidden"
			>
				<ul className="flex gap-2.5 px-0.5">
					{shortcuts.map((shortcut) => {
						const isSelected = shortcut.id === selectedId;
						return (
							<li
								key={shortcut.id}
								className="shrink-0 basis-[260px] snap-start sm:basis-[288px]"
							>
								<button
									type="button"
									onClick={() => onSelect(shortcut)}
									aria-pressed={isSelected}
									className={cn(
										"flex h-full w-full flex-col gap-1.5 rounded-xl border border-graphite bg-charcoal p-3.5 text-left transition-colors hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo",
										isSelected ? "border-indigo" : undefined,
									)}
								>
									<span className="text-sm font-semibold text-snow">
										{shortcut.title}
									</span>
									<span className="line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-fog">
										{shortcut.preview}
									</span>
									<span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 font-mono text-[10px] uppercase tracking-wider text-fog">
										<span>{shortcut.category}</span>
										<span aria-hidden>·</span>
										<span>
											{shortcut.designMode === "mobile" ? "Mobile" : "Web"}
										</span>
										<span aria-hidden>·</span>
										<span>{shortcut.initialPageCount} halaman</span>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>
		</section>
	);
}
