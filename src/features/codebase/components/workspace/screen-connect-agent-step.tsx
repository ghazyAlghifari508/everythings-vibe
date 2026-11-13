import { AiHarnessLogos } from "./ai-harness-logos";
import { ScreenConnectStepItem } from "./screen-connect-step-item";

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
		<ScreenConnectStepItem
			stepNumber={2}
			hasConnector={hasConnector}
			connectorTestId="step-connector-2"
		>
			<div className="flex flex-col gap-0.5">
				<div className="text-xs font-semibold text-mist leading-none">
					{title}
				</div>
				{description && (
					<p className="text-[11px] leading-relaxed text-fog">{description}</p>
				)}
			</div>
			{showHarnesses && <AiHarnessLogos className="pt-0.5" />}
		</ScreenConnectStepItem>
	);
}
