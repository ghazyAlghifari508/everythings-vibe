"use client";

import { Cancel01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Feature, PriceTier } from "@/features/billing/data/pricing-data";
import { TOPUP_SKU } from "@/features/billing/types/billing-constants";
import { cn } from "@/lib/utils";

// --- Utility Components ---

const FeatureItem: React.FC<{ feature: Feature }> = ({ feature }) => {
	const iconGlyph = feature.isIncluded ? Tick01Icon : Cancel01Icon;
	const iconColor = feature.isIncluded ? "text-mist" : "text-slate/60";

	return (
		<li className="flex items-start space-x-3 py-2">
			<Icon
				icon={iconGlyph}
				size={16}
				className={cn("h-4 w-4 flex-shrink-0 mt-0.5", iconColor)}
				aria-hidden="true"
			/>
			<span
				className={cn(
					"font-inter text-sm",
					feature.isIncluded ? "text-mist" : "text-slate",
				)}
			>
				{feature.name}
			</span>
		</li>
	);
};

// --- Main Pricing Cards ---

interface PricingComponentProps extends React.HTMLAttributes<HTMLDivElement> {
	plans: [PriceTier, PriceTier, PriceTier];
	onPlanSelect: (planId: string) => void;
	currentPlan?: string;
	showComparison?: boolean;
	/** Smaller header + spacing for modal embedding */
	compact?: boolean;
	/** Hide the "Pilih Paket yang Sesuai" header (modal embedding) */
	showHeader?: boolean;
	/**
	 * Paid plan whose allowance is spent. Renewing the same tier would reset the
	 * running period, so those cards point at the top-up card instead.
	 */
	creditsExhausted?: boolean;
	/** Server-truth rollout state; public copy must not advertise inactive tariffs. */
	productChargingEnabled?: { studio: boolean; scrape: boolean };
}

export const PricingComponent: React.FC<PricingComponentProps> = ({
	plans,
	onPlanSelect,
	currentPlan = "free",
	showComparison = true,
	compact = false,
	showHeader = true,
	creditsExhausted = false,
	productChargingEnabled = { studio: false, scrape: false },
	className,
	...props
}) => {
	if (plans.length !== 3) {
		console.error("PricingComponent requires exactly 3 pricing tiers.");
		return null;
	}

	const allFeatures = plans[0].features.map((f) => f.name);

	const formatIdr = (num: number) => num.toLocaleString("id-ID");
	const activeProducts = [
		productChargingEnabled.studio ? "Studio" : null,
		productChargingEnabled.scrape ? "Scrape" : null,
	].filter((value): value is string => value !== null);
	const inactiveProducts = [
		productChargingEnabled.studio ? null : "Studio",
		productChargingEnabled.scrape ? null : "Scrape",
	].filter((value): value is string => value !== null);

	const PricingCards = (
		<div className="grid gap-6 md:grid-cols-3">
			{plans.map((plan) => {
				return (
					<Card
						key={plan.id}
						className="flex flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1"
					>
						<CardHeader className="p-6 pb-4 relative">
							<div className="flex justify-between items-start mt-2">
								<CardTitle className="text-2xl font-normal">
									{plan.name}
								</CardTitle>
							</div>
							<CardDescription className="text-sm mt-1">
								{plan.description}
							</CardDescription>
							<div className="mt-4 font-inter">
								<p className="text-4xl font-light text-snow">
									{plan.price === 0 ? "Gratis" : `Rp ${formatIdr(plan.price)}`}
								</p>
								{plan.credits > 0 && (
									<p className="mt-1 text-xs font-[510] text-fog">
										{plan.credits} kredit
										{plan.price > 0 ? " /30 hari" : ""}
									</p>
								)}
							</div>
						</CardHeader>
						<CardContent className="flex-grow p-6 pt-0">
							<h4 className="mb-2 mt-4 font-inter text-sm font-[510] text-snow">
								Fitur Utama:
							</h4>
							<ul className="list-none space-y-0">
								{plan.features.slice(0, 5).map((feature) => (
									<FeatureItem key={feature.name} feature={feature} />
								))}
								{plan.features.length > 5 && (
									<li className="mt-2 font-inter text-sm text-fog">
										+ {plan.features.length - 5} fitur lainnya
									</li>
								)}
							</ul>
						</CardContent>
						<CardFooter className="p-6 pt-0">
							{(() => {
								const isCurrentPlan = currentPlan === plan.id;
								const isFreeCard = plan.id === "free";

								// ponytail: credit model — all paid tiers always purchasable.
								// Free card disabled only if already on free (nothing to buy).
								let buttonLabel = plan.buttonLabel;
								// Checkout target: a plan tier, or the top-up SKU when the
								// current plan's allowance is spent (renewing would reset the
								// running period and forfeit the remaining days).
								let buttonTarget: PriceTier["id"] | typeof TOPUP_SKU.id =
									plan.id;
								const isDisabled = isFreeCard && isCurrentPlan;

								if (isCurrentPlan && !isFreeCard) {
									buttonLabel = `Beli Lagi ${plan.name}`;
								}

								if (creditsExhausted && isCurrentPlan && !isFreeCard) {
									buttonLabel = "Top Up Kredit";
									buttonTarget = TOPUP_SKU.id;
								}

								return (
									<Button
										onClick={() => !isDisabled && onPlanSelect(buttonTarget)}
										disabled={isDisabled}
										className={cn(
											"w-full font-inter font-[510] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
											isDisabled
												? "opacity-50 cursor-not-allowed"
												: "cursor-pointer",
											!isDisabled
												? "border border-snow/70 bg-transparent text-snow hover:bg-white/5"
												: "bg-steel/30 text-slate",
										)}
										size="lg"
										aria-label={`Pilih paket ${plan.name}`}
									>
										{buttonLabel}
									</Button>
								);
							})()}
						</CardFooter>
					</Card>
				);
			})}
		</div>
	);

	const ComparisonTable = (
		<div className="mt-16 hidden overflow-x-auto rounded-xl bg-obsidian shadow-[var(--shadow-inset)] md:block">
			<table className="min-w-full divide-y divide-graphite">
				<thead>
					<tr className="bg-charcoal">
						<th
							scope="col"
							className="w-[200px] whitespace-nowrap px-6 py-4 text-left font-inter text-sm font-[510] text-snow"
						>
							Fitur Lengkap
						</th>
						{plans.map((plan) => (
							<th
								key={`th-${plan.id}`}
								scope="col"
								className={cn(
									"whitespace-nowrap px-6 py-4 text-center font-inter text-sm font-[510] text-snow",
								)}
							>
								{plan.name}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-graphite bg-obsidian font-inter">
					{allFeatures.map((featureName, index) => (
						<tr
							key={featureName}
							className={cn(
								"transition-colors hover:bg-white/5",
								index % 2 === 0 ? "bg-obsidian" : "bg-charcoal/60",
							)}
						>
							<td className="whitespace-nowrap px-6 py-3 text-left text-sm font-[510] text-mist">
								{featureName}
							</td>
							{plans.map((plan) => {
								const feature = plan.features.find(
									(f) => f.name === featureName,
								);
								const isIncluded = feature?.isIncluded ?? false;
								const iconGlyph = isIncluded ? Tick01Icon : Cancel01Icon;
								const iconColor = isIncluded ? "text-mist" : "text-slate/60";

								return (
									<td
										key={`${plan.id}-${featureName}`}
										className={cn(
											"px-6 py-3 text-center transition-all duration-150",
										)}
									>
										<Icon
											icon={iconGlyph}
											size={20}
											className={cn("h-5 w-5 mx-auto", iconColor)}
											aria-hidden="true"
										/>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);

	return (
		<div
			className={cn(
				"mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 md:py-20 lg:px-8",
				className,
			)}
			{...props}
		>
			{showHeader && (
				<header className={cn("text-center", compact ? "mb-2" : "mb-10")}>
					<h2
						className={cn(
							"font-inter font-light leading-tight text-snow",
							compact
								? "text-xl"
								: "text-[40px] max-md:text-[36px] md:text-[48px]",
						)}
					>
						Pilih Paket yang Sesuai
					</h2>
					<p
						className={cn(
							"mx-auto max-w-2xl font-inter leading-relaxed text-fog",
							compact ? "mt-1 text-xs" : "mt-3 text-[17px]",
						)}
					>
						Gunakan satu saldo kredit untuk fitur yang tersedia dalam paketmu.
					</p>
				</header>
			)}

			<section aria-labelledby="pricing-plans">{PricingCards}</section>

			{!compact && (
				<section
					aria-label="Cara kerja kredit"
					className="mt-12 grid gap-8 border-t border-graphite/60 pt-10 md:grid-cols-2"
				>
					<div>
						<h3 className="mb-2 font-inter text-lg font-[510] text-snow">
							Satu saldo untuk semua fitur
						</h3>
						<p className="font-inter text-sm leading-relaxed text-fog">
							Setiap operasi menggunakan kredit sesuai jenis dan pengaturan
							pekerjaan. Operasi dengan biaya tetap memakai jumlah kredit yang
							sama. Operasi adaptif menyesuaikan kompleksitas pekerjaan.
							Estimasi dan batas maksimum ditampilkan sebelum kamu
							menjalankannya.
						</p>
					</div>
					<div>
						<h3 className="mb-2 font-inter text-lg font-[510] text-snow">
							Alokasi, top up, dan trial
						</h3>
						<p className="font-inter text-sm leading-relaxed text-fog">
							Alokasi paket direset setiap 30 hari. Top up menambah saldo
							periode berjalan, tidak memperpanjang masa aktif, dan hangus di
							akhir periode. Revisi PRD via chat, revisi manual, melihat hasil,
							dan VibeTemplate tidak memotong kredit.
						</p>
						<p className="mt-2 font-inter text-sm leading-relaxed text-fog">
							Akun Free mendapat satu trial Studio dan satu trial Scrape tanpa
							pembayaran. Trial tidak diperbarui tiap bulan. Hasil yang sudah
							dibuat tetap bisa diakses.
						</p>
					</div>
					<div className="border-t border-graphite/40 pt-6 md:col-span-2">
						<h3 className="mb-2 font-inter text-lg font-[510] text-snow">
							Status tarif Studio dan Scrape
						</h3>
						{activeProducts.length > 0 && (
							<p className="font-inter text-sm leading-relaxed text-fog">
								{activeProducts.join(" dan ")} menggunakan saldo kredit yang
								sama dengan fitur lain dalam paketmu.
							</p>
						)}
						{inactiveProducts.length > 0 && (
							<p className="font-inter text-sm leading-relaxed text-fog">
								{inactiveProducts.join(" dan ")} saat ini tidak memotong kredit.
								Tarifnya belum diaktifkan dan menunggu benchmark serta
								persetujuan sebelum dipakai.
							</p>
						)}
					</div>
				</section>
			)}

			{showComparison && (
				<section aria-label="Feature Comparison Table" className="mt-16">
					<h3 className="mb-6 hidden text-center font-inter text-[48px] font-light leading-tight text-snow max-md:text-[36px] md:block">
						Perbandingan Fitur
					</h3>
					{ComparisonTable}
				</section>
			)}
		</div>
	);
};
