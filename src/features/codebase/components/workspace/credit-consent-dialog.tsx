"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { TopUpModal } from "@/features/billing/components/top-up-modal";
import { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import type { AnalysisCreditStatus } from "@/features/codebase/services/analysis-credit-policy";

export function CreditConsentDialog({
	open,
	onOpenChange,
	status,
	agreed,
	onAgreedChange,
	error,
	onConfirm,
	isStarting,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	status: AnalysisCreditStatus;
	agreed: boolean;
	onAgreedChange: (agreed: boolean) => void;
	error: string | null;
	onConfirm: () => void;
	isStarting: boolean;
}) {
	const { data: planData } = useUserPlan();
	const [topUpOpen, setTopUpOpen] = useState(false);
	const remaining =
		typeof planData?.remaining === "number"
			? planData.remaining
			: status.availableCredits;

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					data-testid="credit-consent-dialog"
					closeAriaLabel="Tutup persetujuan biaya"
					className="sm:max-w-md"
				>
					<DialogHeader>
						<DialogTitle>Persetujuan biaya analisis</DialogTitle>
						<DialogDescription>
							Analisis membutuhkan hingga {status.maximumCredits} kredit sesuai
							ukuran repository. Saldo tersedia: {remaining} kredit. Biaya akhir
							dihitung setelah sync, tidak melebihi batas ini; kegagalan tidak
							ditagih.
						</DialogDescription>
					</DialogHeader>
					<label
						htmlFor="credit-consent-checkbox"
						className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-graphite bg-onyx p-3 text-xs leading-relaxed text-mist"
					>
						<input
							id="credit-consent-checkbox"
							type="checkbox"
							checked={agreed}
							onChange={(event) => onAgreedChange(event.target.checked)}
							className="mt-0.5 h-4 w-4 shrink-0 accent-white"
						/>
						<span>
							Saya setuju analisis memakan hingga {status.maximumCredits} kredit
							dan sesi sync dibuat sekarang.
						</span>
					</label>
					{error && (
						<p role="alert" className="text-xs text-crimson">
							{error}
						</p>
					)}
					<DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={() => setTopUpOpen(true)}
						>
							Tambahkan Kredit
						</Button>
						<Button
							type="button"
							onClick={onConfirm}
							disabled={!agreed || isStarting}
						>
							{isStarting ? "Menyiapkan sesi..." : "Setuju dan lanjutkan"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} />
		</>
	);
}
