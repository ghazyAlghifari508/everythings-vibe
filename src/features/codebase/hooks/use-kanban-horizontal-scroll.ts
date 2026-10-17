"use client";

import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

// `columnCount` is the fallback for strips that do not overflow yet, before the
// browser reports a scroll width.
export function useKanbanHorizontalScroll({
	columnCount,
}: {
	columnCount: number;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollButtons = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			setCanScrollLeft(false);
			setCanScrollRight(false);
			return;
		}
		const maxScroll = el.scrollWidth - el.clientWidth;
		if (maxScroll <= 0) {
			setCanScrollLeft(el.scrollLeft > 2);
			setCanScrollRight(columnCount > 1);
			return;
		}
		setCanScrollLeft(el.scrollLeft > 2);
		setCanScrollRight(el.scrollLeft < maxScroll - 2);
	}, [columnCount]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		updateScrollButtons();

		el.addEventListener("scroll", updateScrollButtons, { passive: true });

		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => {
				updateScrollButtons();
			});
			observer.observe(el);
		} else if (typeof window !== "undefined") {
			window.addEventListener("resize", updateScrollButtons);
		}

		return () => {
			el.removeEventListener("scroll", updateScrollButtons);
			if (observer) {
				observer.disconnect();
			} else if (typeof window !== "undefined") {
				window.removeEventListener("resize", updateScrollButtons);
			}
		};
	}, [updateScrollButtons]);

	const handleScrollLeft = () => {
		const el = scrollRef.current;
		if (!el) return;
		if (typeof el.scrollBy === "function") {
			el.scrollBy({ left: -236, behavior: "smooth" });
		} else {
			el.scrollLeft -= 236;
		}
		updateScrollButtons();
	};

	const handleScrollRight = () => {
		const el = scrollRef.current;
		if (!el) return;
		if (typeof el.scrollBy === "function") {
			el.scrollBy({ left: 236, behavior: "smooth" });
		} else {
			el.scrollLeft += 236;
		}
		updateScrollButtons();
	};

	const handleToolbarKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			handleScrollLeft();
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			handleScrollRight();
		}
	};

	return {
		scrollRef,
		canScrollLeft,
		canScrollRight,
		handleScrollLeft,
		handleScrollRight,
		handleToolbarKeyDown,
	};
}
