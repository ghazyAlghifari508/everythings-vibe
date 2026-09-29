"use client";

import { useState } from "react";
import { ChatInput, type HomeProjectMode } from "./chat-input";
import { CodebaseFeatureGallery } from "./codebase-feature-gallery";
import { TemplateGallery } from "./template-gallery";

export function HeroContent({
	initialPrompt,
	initialPlatform,
	hideModeSelector,
}: {
	initialPrompt?: string;
	initialPlatform?: "web" | "mobile";
	hideModeSelector?: boolean;
} = {}) {
	const [prefill, setPrefill] = useState<string | undefined>(initialPrompt);
	const [prefillMobile, setPrefillMobile] = useState(
		initialPlatform === "mobile",
	);
	// ponytail: re-selecting the same template yields the same string, which
	// React useState bails out on. The tick forces ChatInput's sync effect
	// to re-run so the textarea re-prefills every click.
	const [prefillTick, setPrefillTick] = useState(0);
	const [projectMode, setProjectMode] = useState<HomeProjectMode>("greenfield");
	return (
		<div className="relative z-10 flex w-full flex-col items-center px-6 text-center">
			<div className="flex w-full max-w-[1200px] flex-col items-center gap-4 sm:gap-6 pt-2 sm:pt-4">
				<h1 className="max-w-[860px] font-inter text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-snow">
					Dari ide produk ke PRD yang siap dieksekusi
				</h1>

				<p className="max-w-[650px] font-inter text-[17px] font-normal leading-[1.6] text-fog">
					Describe produk kamu secara natural dan AI akan generate Product
					Requirements Document yang lengkap, terstruktur, dan profesional.
				</p>

				<div className="w-full">
					<ChatInput
						initialValue={prefill}
						initialMobile={prefillMobile}
						prefillKey={prefillTick}
						onModeChange={setProjectMode}
						hideModeSelector={hideModeSelector}
					/>
					{projectMode === "greenfield" ? (
						<TemplateGallery
							onSelect={(p, platform) => {
								setPrefill(p);
								setPrefillMobile(platform === "mobile");
								setPrefillTick((t) => t + 1);
							}}
						/>
					) : (
						<CodebaseFeatureGallery
							onSelect={(p) => {
								setPrefill(p);
								setPrefillTick((t) => t + 1);
							}}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
