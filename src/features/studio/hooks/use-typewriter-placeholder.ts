import { useEffect, useState } from "react";
import type { StudioDesignMode } from "@/features/studio/types/studio-prompts";

export const STUDIO_PLACEHOLDERS: Record<StudioDesignMode, string> = {
	mobile:
		"Contoh: Aplikasi pesan kopi dengan pilihan menu, kustomisasi minuman, checkout, dan pelacakan pesanan.",
	web: "Contoh: Dashboard bisnis dengan laporan penjualan, grafik performa, tabel transaksi, dan manajemen tim.",
};

const TYPEWRITER_CHAR_INTERVAL_MS = 24;

export interface UseTypewriterPlaceholderOptions {
	mode: StudioDesignMode;
	isEmpty: boolean;
	isFocused: boolean;
}

/**
 * Provides a dynamic, platform-aware placeholder with a subtle typing animation.
 *
 * Invariants:
 * - Never modifies actual input value (only placeholder string).
 * - Pauses on focus and stops when user types.
 * - Respects `prefers-reduced-motion` immediately without animation.
 * - Restarts clean animation when mode switches.
 */
export function useTypewriterPlaceholder({
	mode,
	isEmpty,
	isFocused,
}: UseTypewriterPlaceholderOptions): string {
	const targetText = STUDIO_PLACEHOLDERS[mode] ?? STUDIO_PLACEHOLDERS.web;
	const [charIndex, setCharIndex] = useState(0);

	const [prevMode, setPrevMode] = useState(mode);
	if (prevMode !== mode) {
		setPrevMode(mode);
		setCharIndex(0);
	}

	const prefersReducedMotion =
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	useEffect(() => {
		if (prefersReducedMotion || !isEmpty || isFocused) {
			return;
		}

		const interval = setInterval(() => {
			setCharIndex((prev) => {
				if (prev >= targetText.length) {
					clearInterval(interval);
					return prev;
				}
				return prev + 1;
			});
		}, TYPEWRITER_CHAR_INTERVAL_MS);

		return () => clearInterval(interval);
	}, [targetText, isEmpty, isFocused, prefersReducedMotion]);

	if (prefersReducedMotion || !isEmpty) {
		return targetText;
	}

	if (isFocused) {
		return charIndex === 0 ? targetText : targetText.slice(0, charIndex);
	}

	return targetText.slice(0, charIndex);
}
