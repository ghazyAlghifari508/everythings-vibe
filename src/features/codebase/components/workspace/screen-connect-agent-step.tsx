import { cn } from "@/lib/utils";
import { AiHarnessLogos } from "./ai-harness-logos";

export interface ScreenConnectAgentStepProps {
	/** Step title; the re-sync modal names the same action in its own words. */
	title?: string;
	description?: string;
	/** Harness marks belong to onboarding and re-sync. */
	showHarnesses?: boolean;
	/** Vertical line connector extending to next step. */
	hasConnector?: boolean;
}

export function ScreenConnectAgentStep({
	title = "Buka AI coding agent di repository kamu",
	description = "Pastikan agent berjalan dari root folder project yang ingin dianalisis.",
	showHarnesses = true,
	hasConnector = true,
}: ScreenConnectAgentStepProps) {
	return (
		<div className="flex items-stretch gap-3.5">
			<div className="flex w-6 shrink-0 flex-col items-center">
				<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
					2
				</span>
				{hasConnector && (
					<div
						data-testid="step-connector-2"
						className="mt-2 w-px flex-1 bg-graphite/40"
						aria-hidden="true"
					/>
				)}
			</div>
			<div
				className={cn(
					"flex w-full min-w-0 flex-col gap-2.5",
					hasConnector && "pb-6",
				)}
			>
				<div>
					<div className="text-xs font-semibold text-mist">{title}</div>
					<p className="text-[11px] leading-relaxed text-fog">{description}</p>
				</div>
				{showHarnesses && <AiHarnessLogos className="pt-0.5" />}
			</div>
		</div>
	);
}
