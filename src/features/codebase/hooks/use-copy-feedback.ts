import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "@/features/codebase/utils/clipboard";

/** How long a success or failure badge stays on screen before it clears. */
const COPIED_FEEDBACK_MS = 2000;
const ERROR_FEEDBACK_MS = 4000;

/**
 * Clipboard feedback for a copy affordance: a short-lived success flag, a
 * short-lived error message, and the timer that clears whichever is showing.
 *
 * Only one message is ever pending, so a second copy replaces the first
 * timer instead of stacking another one. The pending timer is cleared on
 * unmount so a copy cannot write state after its screen has closed. The
 * caller remounts (via `key`) when the copied content identity changes, so
 * a success badge can never survive a token rotation.
 */
export function useCopyFeedback() {
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		};
	}, []);

	const scheduleClear = (clear: () => void, delayMs: number) => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(clear, delayMs);
	};

	const copy = async (text: string) => {
		if (!text) return;
		const result = await copyToClipboard(text);
		if (result.success) {
			setCopied(true);
			setCopyError(null);
			scheduleClear(() => setCopied(false), COPIED_FEEDBACK_MS);
		} else {
			setCopied(false);
			setCopyError(
				result.error ??
					"Gagal menyalin otomatis. Silakan salin teks secara manual.",
			);
			scheduleClear(() => setCopyError(null), ERROR_FEEDBACK_MS);
		}
	};

	return { copied, copyError, copy };
}
