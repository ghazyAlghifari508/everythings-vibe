"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AnalysisCreditStatus } from "@/features/codebase/services/analysis-credit-policy";
import { LockedPromptAction } from "./locked-prompt-action";

export interface LockedPromptState {
	variant: "insufficient" | "unavailable" | "pending";
	title: string;
	/** Omitted only for a state whose label already says everything. */
	description?: string;
	action?: React.ReactNode;
	/**
	 * A consequence the user must accept before acting (the previous credential
	 * stops working). Only for states that genuinely replace one.
	 */
	note?: string;
}

/**
 * The one presentation for a prompt that is not the real CLI credential:
 * a credit lock, a recoverable prompt, or a genuinely pending replacement.
 * Left-aligned inside the prompt box that already owns the border and
 * background, so no second card, overlay, or centered empty state exists.
 */
export function LockedPromptStateView({
	variant,
	title,
	description,
	action,
	note,
}: LockedPromptState) {
	const pending = variant === "pending";
	return (
		<div
			data-testid="locked-prompt-region"
			data-locked-variant={variant}
			aria-busy={pending || undefined}
			className="flex flex-col items-start gap-3 font-sans"
		>
			<div className="flex flex-col items-start gap-1.5">
				<p className="flex items-center gap-2 text-sm font-semibold text-snow">
					{pending && <Spinner size={14} className="text-blue-400" />}
					{title}
				</p>
				{description && (
					<p className="max-w-[62ch] text-xs leading-relaxed text-fog">
						{description}
					</p>
				)}
			</div>
			{action}
			{note && (
				<p className="max-w-[62ch] text-[11px] leading-relaxed text-mist">
					{note}
				</p>
			)}
		</div>
	);
}

/**
 * One source of truth for both entry points (onboarding and re-sync), so the
 * policy cannot diverge between them.
 */
export function buildLockedPrompt(
	status: AnalysisCreditStatus | null,
	actions: {
		onTopUpClose?: () => void;
	},
): LockedPromptState | null {
	if (!status || status.canStart) return null;
	const insufficient =
		status.code === "INSUFFICIENT_CREDITS" ||
		status.code === "SUBSCRIPTION_PAUSED";
	if (status.code === "BILLING_UNAVAILABLE")
		return {
			variant: "unavailable",
			title: "Kebutuhan kredit belum dapat diperiksa",
			description: "Coba lagi untuk memeriksa status billing akun.",
			action: (
				<Button type="button" onClick={actions.onTopUpClose}>
					Coba lagi
				</Button>
			),
		};
	return {
		variant: insufficient ? "insufficient" : "unavailable",
		title: insufficient ? "Kredit tidak mencukupi" : "Analisis belum tersedia",
		description: insufficient
			? "Tambahkan kredit untuk melanjutkan."
			: "Tunggu hingga analisis berjalan selesai, lalu coba lagi.",
		action: insufficient ? (
			<LockedPromptAction onEligibilityRefresh={actions.onTopUpClose} />
		) : null,
	};
}
