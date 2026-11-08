import { AiHarnessLogos } from "./ai-harness-logos";

interface ScreenConnectAgentStepProps {
	/** Step title; the re-sync modal names the same action in its own words. */
	title?: string;
	description?: string;
	/** Harness marks belong to onboarding; a re-sync needs no new tooling. */
	showHarnesses?: boolean;
}

export function ScreenConnectAgentStep({
	title = "Buka AI coding agent di repository kamu",
	description = "Pastikan agent berjalan dari root folder project yang ingin dianalisis.",
	showHarnesses = true,
}: ScreenConnectAgentStepProps) {
	return (
		<div className="flex items-start gap-3.5">
			<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
				2
			</span>
			<div className="flex w-full flex-col gap-2.5">
				<div>
					<div className="text-xs font-semibold text-mist">{title}</div>
					<p className="text-[11px] leading-relaxed text-fog">{description}</p>
				</div>
				{showHarnesses && <AiHarnessLogos className="pt-0.5" />}
			</div>
		</div>
	);
}
