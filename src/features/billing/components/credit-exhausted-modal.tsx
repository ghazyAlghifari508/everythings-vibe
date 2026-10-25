"use client";

import { Coins01Icon, Loading01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import {
	CreditExhaustedModalHeader,
	type CreditQuote,
} from "@/features/billing/components/credit-exhausted-modal-header";
import { CreditPackageRadioGroup } from "@/features/billing/components/credit-package-radio-group";
import { PricingComponent } from "@/features/billing/components/pricing-card";
import { prdFyPlans } from "@/features/billing/data/pricing-data";
import { useCreditTopupDialog } from "@/features/billing/hooks/use-credit-topup-dialog";
import { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import { TOPUP_PACKAGES } from "@/features/billing/types/billing-constants";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";

interface CreditExhaustedModalProps {
	isOpen: boolean;
	onClose: () => void;
	errorMessage: string;
	projectId: string;
	stage: "prd" | "ac" | "task";
	currentPlan?: string;
	// ponytail: plan-gate paywalls reuse this modal with a stage-specific title
	// ("Lanjut ke AC butuh Pro") instead of the credit-depletion default.
	title?: string;
	requiredCredits?: number;
	availableCredits?: number;
	quote?: CreditQuote;
}

export function CreditExhaustedModal({
	isOpen,
	onClose,
	errorMessage,
	projectId,
	stage,
	currentPlan = "free",
	title = "Kredit Habis",
	requiredCredits,
	availableCredits,
	quote,
}: CreditExhaustedModalProps) {
	// ponytail: shared TanStack Query hook — deduped across all components.
	const { data: planData } = useUserPlan();
	const dialogRef = useFocusTrap<HTMLDivElement>({
		isOpen,
		onEscape: onClose,
	});
	const {
		view,
		setView,
		isPaidTopUp,
		selectedPackage,
		selectedPackageId,
		setSelectedPackageId,
		loading,
		remainingCredits,
		formattedExpiry,
		handlePlanSelect,
	} = useCreditTopupDialog({
		isOpen,
		projectId,
		stage,
		title,
		currentPlan,
		planData,
	});

	if (!isOpen) return null;

	return (
		<div
			ref={dialogRef}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200 overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-labelledby="credit-exhausted-modal-title"
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<button
				type="button"
				className="fixed inset-0 cursor-default bg-transparent border-none p-0 w-full h-full"
				aria-label="Tutup modal"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div
				className={cn(
					"relative z-10 w-full overflow-y-auto max-h-[85vh] rounded-xl bg-obsidian shadow-[var(--shadow-overlay)] animate-in zoom-in-95 duration-200 my-4",
					view === "topup" ? "max-w-xl" : "max-w-5xl",
				)}
			>
				<CreditExhaustedModalHeader
					view={view}
					onClose={onClose}
					title={title}
					errorMessage={errorMessage}
					requiredCredits={requiredCredits}
					availableCredits={availableCredits}
					quote={quote}
				/>

				{/* Content Body */}
				{view === "topup" ? (
					<div className="p-4 sm:p-6 space-y-4">
						{/* Current Balance Status */}
						<div className="rounded-lg border border-graphite/60 bg-charcoal/50 p-3 text-xs">
							<div className="flex items-center justify-between">
								<span className="flex items-center gap-1.5 text-fog">
									<Icon
										icon={Coins01Icon}
										size={14}
										className="text-fog"
										aria-hidden
									/>
									Saldo Kredit Saat Ini:
								</span>
								<span className="font-mono font-medium text-snow">
									{remainingCredits} kredit
								</span>
							</div>
							{formattedExpiry && (
								<div className="mt-1.5 flex items-center justify-between border-t border-graphite/40 pt-1.5 text-fog">
									<span>Periode Berjalan:</span>
									<span>Berakhir pada {formattedExpiry}</span>
								</div>
							)}
						</div>

						{/* Package Selector */}
						<div className="space-y-2.5">
							<p
								id="credit-package-group-label"
								className="text-xs font-[510] text-fog uppercase tracking-wider"
							>
								Pilihan Paket
							</p>
							<CreditPackageRadioGroup
								packages={TOPUP_PACKAGES}
								selectedPackageId={selectedPackageId}
								onSelect={setSelectedPackageId}
								labelledBy="credit-package-group-label"
								className="max-h-[300px] overflow-y-auto pr-1"
							/>
						</div>

						{/* Upsell Banner to Subscription */}
						<button
							type="button"
							onClick={() => setView("subscription")}
							className="w-full text-left rounded-xl border border-graphite bg-charcoal/60 p-3.5 hover:border-fog/40 hover:bg-white/[0.03] transition flex items-center justify-between cursor-pointer"
						>
							<div>
								<span className="text-xs font-semibold text-snow">
									Mau kuota lebih banyak & fitur lengkap?
								</span>
								<p className="text-[11px] text-fog mt-0.5">
									Mulai Rp 49.000/bulan untuk 30 kredit, full AC, Task & Kanban.
								</p>
							</div>
							<span className="flex items-center gap-1 font-mono text-xs text-snow font-medium shrink-0 ml-2">
								{"Lihat Paket Langganan ->"}
							</span>
						</button>

						{/* Buy Action Button */}
						<button
							type="button"
							disabled={loading || !selectedPackage}
							onClick={() =>
								selectedPackage && handlePlanSelect(selectedPackage.id)
							}
							aria-label={`Beli ${selectedPackage?.credits ?? 0} Kredit — Rp ${selectedPackage ? selectedPackage.priceIdr.toLocaleString("id-ID") : 0}`}
							className="btn-primary flex h-10 w-full items-center justify-center gap-2 rounded-lg font-inter text-sm font-[510] transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
						>
							{loading ? (
								<>
									<Icon
										icon={Loading01Icon}
										size={16}
										className="animate-spin"
										aria-hidden
									/>
									<span>Memproses Pembayaran...</span>
								</>
							) : (
								<span>
									Beli {selectedPackage?.credits} Kredit — Rp{" "}
									{selectedPackage?.priceIdr.toLocaleString("id-ID")}
								</span>
							)}
						</button>
					</div>
				) : (
					<div className="px-2 pb-3">
						{isPaidTopUp && (
							<div className="mb-2 px-2 pt-2">
								<button
									type="button"
									onClick={() => setView("topup")}
									className="inline-flex items-center gap-1.5 text-xs text-fog hover:text-snow transition-colors cursor-pointer"
								>
									{"<- Kembali ke Pilihan Top Up"}
								</button>
							</div>
						)}
						<PricingComponent
							plans={prdFyPlans}
							onPlanSelect={handlePlanSelect}
							currentPlan="free"
							creditsExhausted={planData?.creditsExhausted === true}
							showComparison={false}
							showHeader={false}
							compact
							className="!py-3 md:!py-3"
						/>
					</div>
				)}
			</div>
		</div>
	);
}
