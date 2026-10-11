"use client";

import { useMemo, useState } from "react";
import {
	type DesignInspectorModel,
	inspectorFromEvidence,
	parseDesignMd,
} from "@/lib/design-md-inspector";
import { displaySiteName } from "@/lib/site-name";
import { DesignAgentPromptDialog } from "./design-agent-prompt-dialog";
import { DesignMdSourcePanel } from "./design-md-source-panel";
import { DesignSystemInspector } from "./design-system-inspector";

export interface DesignResultProps {
	sourceUrl: string;
	domain: string;
	designMd: string;
	visualEvidence?: unknown;
}

export interface ResolvedInspector {
	model: DesignInspectorModel;
	// "observed" means the values came from a verified browser capture whose
	// document still matches that capture. "unverified" means only the archived
	// markdown could be parsed, so values are shown as parsed text, never as
	// capture-verified measurements.
	source: "observed" | "unverified";
}

// Single decision point for what the inspector shows. The archive fallback is
// explicit here and never presented as equivalent to verified evidence.
export function resolveInspector(
	visualEvidence: unknown,
	designMd: string,
): ResolvedInspector {
	const observed = inspectorFromEvidence(visualEvidence, designMd);
	if (observed) return { model: observed, source: "observed" };
	return {
		model: { ...parseDesignMd(designMd), verification: "unverified" },
		source: "unverified",
	};
}

export function DesignResult({
	sourceUrl,
	domain,
	designMd,
	visualEvidence,
}: DesignResultProps) {
	const [agentOpen, setAgentOpen] = useState(false);
	const siteName = displaySiteName(domain);
	const { model, source } = useMemo(
		() => resolveInspector(visualEvidence, designMd),
		[designMd, visualEvidence],
	);

	return (
		<div className="grid min-w-0 w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:gap-8">
			<DesignSystemInspector
				siteName={siteName}
				sourceUrl={sourceUrl}
				model={model}
			/>
			<div className="min-w-0 lg:sticky lg:top-20">
				<DesignMdSourcePanel
					designMd={designMd}
					domain={domain}
					inspectorSource={source}
					onImplementAgent={() => setAgentOpen(true)}
					className="lg:max-h-[calc(100vh-6rem)]"
				/>
			</div>
			<DesignAgentPromptDialog
				open={agentOpen}
				onOpenChange={setAgentOpen}
				siteName={siteName}
				sourceUrl={sourceUrl}
				designMd={designMd}
			/>
		</div>
	);
}
