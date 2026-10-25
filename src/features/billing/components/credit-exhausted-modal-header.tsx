"use client";

import {
	AlertCircleIcon,
	Cancel01Icon,
	CreditCardIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { CreditTopUpView } from "@/features/billing/hooks/use-credit-topup-dialog";
import { cn } from "@/lib/utils";

export interface CreditQuote {
	estimatedCredits?: number;
	maximumCredits?: number;
	pricingVersion?: string;
}

interface CreditExhaustedModalHeaderProps {
	view: CreditTopUpView;
	onClose: () => void;
	title: string;
	errorMessage: string;
	requiredCredits?: number;
	availableCredits?: number;
	quote?: CreditQuote;
}

export function CreditExhaustedModalHeader({
	view,
	onClose,
	title,
	errorMessage,
	requiredCredits,
	availableCredits,
	quote,
}: CreditExhaustedModalHeaderProps) {
	return (
		<div className="relative p-4 pb-0 text-center">
			<button
				type="button"
				onClick={onClose}
				className="absolute right-4 top-4 text-fog transition-colors hover:text-snow cursor-pointer"
				aria-label="Tutup"
			>
				<Icon icon={Cancel01Icon} size={20} />
			</button>
			<div
				className={cn(
					"mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full",
					view === "topup"
						? "bg-indigo/10 text-indigo"
						: "bg-crimson/10 text-crimson",
				)}
			>
				{view === "topup" ? (
					<Icon icon={CreditCardIcon} size={20} strokeWidth={2} />
				) : (
					<Icon icon={AlertCircleIcon} size={20} strokeWidth={2} />
				)}
			</div>
			<h3
				id="credit-exhausted-modal-title"
				className="font-inter text-xl font-[510] text-snow"
			>
				{view === "topup" ? "Isi Ulang Kredit Instan" : title}
			</h3>
			<p className="mt-2 font-inter text-sm text-fog">{errorMessage}</p>

			{(requiredCredits !== undefined || quote) && (
				<div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 text-left mx-auto max-w-md">
					{requiredCredits !== undefined && (
						<div className="flex justify-between items-center py-0.5">
							<span className="text-fog">Kebutuhan Kredit:</span>
							<span className="font-semibold text-snow font-mono">
								{requiredCredits} kredit
							</span>
						</div>
					)}
					{availableCredits !== undefined && (
						<div className="flex justify-between items-center py-0.5">
							<span className="text-fog">Saldo Tersedia:</span>
							<span className="font-semibold text-snow font-mono">
								{availableCredits} kredit
							</span>
						</div>
					)}
					{quote && (
						<div className="mt-1 pt-1 border-t border-amber-500/20 flex justify-between items-center text-[11px] text-fog">
							<span>Estimasi: {quote.estimatedCredits ?? "-"} kredit</span>
							<span>Maksimum: {quote.maximumCredits ?? "-"} kredit</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
