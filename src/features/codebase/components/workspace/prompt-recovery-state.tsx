"use client";

import { Button } from "@/components/ui/button";
import type { LockedPromptState } from "./locked-prompt-state";

/**
 * The four presentations a sync credential that is not on screen can have.
 *
 * - `unavailable` — the prompt existed but is gone (page was left/closed). The
 *   repository, its session, and its History entry are all intact.
 * - `expired` — the session ended before the CLI used it.
 * - `replacing` — the user asked for a new prompt and the server request is
 *   genuinely in flight.
 * - `failed` — the replacement request itself failed. The only real error.
 */
export type PromptRecoveryKind =
	| "unavailable"
	| "expired"
	| "replacing"
	| "failed";

/**
 * The approved wording for every recoverable state, in one place, so the
 * onboarding page and the prompt row cannot drift apart. These strings are a
 * product decision, never generated copy.
 */
export function buildPromptRecoveryState(
	kind: PromptRecoveryKind,
	onRequestNewPrompt: (() => void) | null,
): LockedPromptState {
	if (kind === "replacing")
		return { variant: "pending", title: "Menyiapkan prompt baru..." };

	if (kind === "failed")
		return {
			variant: "unavailable",
			title: "Prompt belum berhasil dibuat",
			description: "Permintaan belum berhasil. Coba buat prompt lagi.",
			action: replacementButton("Coba lagi", onRequestNewPrompt),
		};

	if (kind === "expired")
		return {
			variant: "unavailable",
			title: "Sesi sinkronisasi berakhir",
			description:
				"Buat prompt baru untuk melanjutkan sinkronisasi repository ini.",
			action: replacementButton("Buat prompt baru", onRequestNewPrompt),
		};

	const action = replacementButton("Buat prompt baru", onRequestNewPrompt);
	return {
		variant: "unavailable",
		title: "Lanjutkan sinkronisasi",
		description:
			"Prompt sebelumnya tidak tersedia lagi setelah halaman ditutup. Buat prompt baru untuk melanjutkan repository ini.",
		// Only stated when a replacement is actually offered: it is the one
		// consequence the user has to accept before clicking.
		note: action
			? "Prompt sebelumnya tidak berlaku setelah diganti."
			: undefined,
		action,
	};
}

function replacementButton(
	label: string,
	onRequestNewPrompt: (() => void) | null,
) {
	if (!onRequestNewPrompt) return undefined;
	return (
		<Button
			type="button"
			onClick={onRequestNewPrompt}
			variant="secondary"
			className="min-h-11 px-3.5 text-xs"
		>
			{label}
		</Button>
	);
}
