"use client";

import { LockIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AnalysisCreditStatus } from "@/features/codebase/services/analysis-credit-policy";
import { LockedPromptAction } from "./locked-prompt-action";

/**
 * The whole prompt region replaced by one centered state. `approval` is a
 * changed quote, never a routine sync: the account already authorized the old
 * ceiling, so only a new rate asks again.
 */
export interface LockedPromptState {
	variant: "insufficient" | "approval";
	title: string;
	description: string;
	action?: React.ReactNode;
}

export function LockedPromptStateView({
	variant,
	title,
	description,
	action,
}: LockedPromptState) {
	return (
		<div
			data-testid="locked-prompt-region"
			data-locked-variant={variant}
			className="flex min-h-[190px] flex-col items-center justify-center gap-3 px-2 py-6 text-center font-sans"
		>
			<span className="flex h-10 w-10 items-center justify-center rounded-full border border-graphite bg-charcoal">
				<Icon icon={LockIcon} size={18} className="text-fog" />
			</span>
			<div className="flex flex-col items-center gap-1">
				<p className="text-sm font-semibold text-snow">{title}</p>
				<p className="max-w-[38ch] text-xs leading-relaxed text-fog">
					{description}
				</p>
			</div>
			{action}
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
		onApprove: () => void;
		onTopUpClose?: () => void;
		isApproving?: boolean;
	},
): LockedPromptState | null {
	if (!status || status.canStart) return null;
	if (!status.requiresApproval) {
		return {
			variant: "insufficient",
			title: "Kredit tidak mencukupi",
			description: "Tambahkan kredit untuk melanjutkan.",
			action: (
				<LockedPromptAction onEligibilityRefresh={actions.onTopUpClose} />
			),
		};
	}
	return {
		variant: "approval",
		title: "Tarif analisis diperbarui",
		description: `Setujui hingga ${status.maximumCredits} kredit sekali di sini. Sync berikutnya memakai otorisasi yang sama.`,
		action: (
			<Button
				type="button"
				onClick={actions.onApprove}
				disabled={actions.isApproving}
			>
				{actions.isApproving ? "Menyiapkan sesi..." : "Setujui dan lanjutkan"}
			</Button>
		),
	};
}
