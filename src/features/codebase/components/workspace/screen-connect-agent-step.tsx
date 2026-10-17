import { AiHarnessLogos } from "./ai-harness-logos";

export function ScreenConnectAgentStep() {
	return (
		<div className="flex items-start gap-3.5">
			<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
				2
			</span>
			<div className="flex w-full flex-col gap-2.5">
				<div>
					<div className="text-xs font-semibold text-mist">
						Buka AI coding agent di repository kamu
					</div>
					<p className="text-[11px] leading-relaxed text-fog">
						Pastikan agent berjalan dari root folder project yang ingin
						dianalisis.
					</p>
				</div>
				<AiHarnessLogos className="pt-0.5" />
			</div>
		</div>
	);
}
