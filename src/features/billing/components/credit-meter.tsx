import { Meter } from "@heroui/react";
import { cn } from "@/lib/utils";
import {
	type CreditMeterInput,
	type CreditMeterTone,
	resolveCreditMeter,
} from "../utils/credit-meter";

const toneClass: Record<CreditMeterTone, string> = {
	neutral: "bg-fog/40",
	success: "bg-emerald/80",
	warning: "bg-warning/80",
	danger: "bg-crimson/90",
};

/**
 * Reusable billing meter. HeroUI Meter supplies role=meter with ARIA value
 * semantics; the two segments distinguish settled usage from live reservations.
 * All copy and thresholds live in resolveCreditMeter, not in presentation.
 */
export function CreditMeter(input: CreditMeterInput) {
	const meter = resolveCreditMeter(input);

	return (
		<div>
			<div className="mb-2 flex justify-between text-sm">
				<span className="text-(--text-secondary)">Kredit digunakan</span>
				<span className="font-medium">
					{meter.used} / {meter.allocation}
					{meter.reserved > 0 && (
						<span className="ml-1 text-xs font-normal text-warning">
							({meter.reserved} direservasi)
						</span>
					)}
				</span>
			</div>
			<Meter
				aria-label="Kredit digunakan"
				valueLabel={meter.label}
				value={meter.used + meter.reserved}
				minValue={0}
				maxValue={meter.allocation}
				data-state={meter.state}
			>
				<Meter.Track className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-(--bg-card)">
					<div
						data-segment="used"
						data-tone={meter.tone}
						data-testid="credit-meter-used"
						aria-hidden="true"
						className={cn(
							"h-full rounded-full transition-[width] duration-200",
							toneClass[meter.tone],
						)}
						style={{ width: `${meter.usedPercent}%` }}
					/>
					<div
						data-segment="reserved"
						data-tone="neutral"
						data-testid="credit-meter-reserved"
						aria-hidden="true"
						className={cn(
							"absolute inset-y-0 rounded-full bg-fog/40 transition-[width] duration-200",
							meter.reserved > 0 ? "block" : "hidden",
						)}
						style={{
							left: `${meter.usedPercent}%`,
							width: `${meter.reservedPercent}%`,
						}}
					/>
				</Meter.Track>
			</Meter>
			<p className="mt-2 text-xs text-(--text-secondary)">{meter.message}</p>
		</div>
	);
}
