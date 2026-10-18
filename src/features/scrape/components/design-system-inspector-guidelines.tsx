import { Check, X } from "lucide-react";
import type { InspectorGuideline } from "@/features/scrape/utils/design-md-inspector";

export function GuidelineList({
	rules,
	tone,
}: {
	rules: InspectorGuideline[];
	tone: "do" | "dont";
}) {
	return (
		<ul className="flex flex-col gap-3">
			{rules.map((rule) => (
				<li key={rule.rule} className="flex items-start gap-2">
					{tone === "do" ? (
						<Check
							size={15}
							strokeWidth={2.5}
							className="mt-0.5 shrink-0 text-emerald-400"
							aria-hidden="true"
						/>
					) : (
						<X
							size={15}
							strokeWidth={2.5}
							className="mt-0.5 shrink-0 text-crimson"
							aria-hidden="true"
						/>
					)}
					<span className="min-w-0">
						<span className="block text-sm leading-relaxed text-mist">
							{rule.rule}
						</span>
						{rule.evidence ? (
							<span className="mt-0.5 block text-[11px] leading-4 text-fog">
								{rule.evidence}
							</span>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}

export function LimitationList({ limitations }: { limitations: string[] }) {
	return (
		<ul className="flex flex-col gap-2">
			{limitations.map((limitation) => (
				<li
					key={limitation}
					className="flex items-start gap-2 text-xs leading-5 text-fog"
				>
					<span aria-hidden="true" className="mt-1.5 shrink-0">
						<span className="block size-1 rounded-full bg-slate" />
					</span>
					{limitation}
				</li>
			))}
		</ul>
	);
}
