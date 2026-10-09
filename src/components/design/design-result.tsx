"use client";

import { useMemo, useState } from "react";
import { parseDesignMd } from "@/lib/design-md-inspector";
import { displaySiteName } from "@/lib/site-name";
import { DesignAgentPromptDialog } from "./design-agent-prompt-dialog";
import { DesignMdSourcePanel } from "./design-md-source-panel";
import { DesignSystemInspector } from "./design-system-inspector";

export interface DesignResultProps {
	sourceUrl: string;
	domain: string;
	designMd: string;
}

export function DesignResult({
	sourceUrl,
	domain,
	designMd,
}: DesignResultProps) {
	const [agentOpen, setAgentOpen] = useState(false);
	const siteName = displaySiteName(domain);
	const model = useMemo(() => parseDesignMd(designMd), [designMd]);

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
