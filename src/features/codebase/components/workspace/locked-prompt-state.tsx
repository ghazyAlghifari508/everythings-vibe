"use client";

import { LockIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AnalysisCreditStatus } from "@/features/codebase/services/analysis-credit-policy";
import { LockedPromptAction } from "./locked-prompt-action";

export interface LockedPromptState {
	variant: "insufficient" | "unavailable";
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
