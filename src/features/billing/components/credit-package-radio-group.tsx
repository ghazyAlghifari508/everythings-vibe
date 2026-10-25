"use client";

import { Tick01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { TopUpPackage } from "@/features/billing/types/billing-constants";
import { cn } from "@/lib/utils";

interface CreditPackageRadioGroupProps {
	packages: readonly TopUpPackage[];
	selectedPackageId: string;
	onSelect: (packageId: string) => void;
	labelledBy?: string;
	/** Shared name so native radios form one arrow-key-navigable group. */
	name?: string;
	className?: string;
}

export function CreditPackageRadioGroup({
	packages,
	selectedPackageId,
	onSelect,
	labelledBy,
	name = "credit-topup-package",
	className,
}: CreditPackageRadioGroupProps) {
	return (
		<div
			role="radiogroup"
			aria-labelledby={labelledBy}
			className={cn("space-y-2.5", className)}
		>
			{packages.map((pkg) => {
				const isSelected = pkg.id === selectedPackageId;
				const priceStr = pkg.priceIdr.toLocaleString("id-ID");
				const perUnit = Math.round(pkg.priceIdr / pkg.credits).toLocaleString(
					"id-ID",
				);

				return (
					<label
						key={pkg.id}
						className={cn(
							"block w-full text-left rounded-xl border p-3.5 transition-all duration-200 cursor-pointer focus-within:ring-1 focus-within:ring-fog/40",
							isSelected
								? "border-snow bg-white/10 shadow-sm"
								: "border-graphite bg-charcoal/30 hover:border-fog/40 hover:bg-white/[0.03]",
						)}
					>
						<input
							type="radio"
							name={name}
							value={pkg.id}
							checked={isSelected}
							onChange={() => onSelect(pkg.id)}
							className="sr-only"
						/>
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-center gap-2.5">
								<span
									className={cn(
										"flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
										isSelected
											? "border-snow bg-snow text-onyx"
											: "border-graphite bg-transparent",
									)}
									aria-hidden="true"
								>
									{isSelected && (
										<Icon icon={Tick01Icon} size={10} strokeWidth={3} />
									)}
								</span>
								<div>
									<span className="flex items-center gap-2">
										<span className="text-sm font-semibold text-snow">
											{pkg.name} ({pkg.credits} Kredit)
										</span>
										{pkg.recommended && (
											<span className="rounded border border-fog/30 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-snow">
												Rekomendasi
											</span>
										)}
									</span>
									<span className="mt-0.5 block text-xs text-fog leading-relaxed">
										{pkg.description}
									</span>
								</div>
							</div>
							<span className="text-right shrink-0">
								<span className="block font-mono text-sm font-semibold text-snow">
									Rp {priceStr}
								</span>
								<span className="block text-[11px] text-fog font-mono">
									Rp {perUnit}/kredit
								</span>
							</span>
						</div>
					</label>
				);
			})}
		</div>
	);
}
