"use client";

import { Tick01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";

function valueOrUnknown(value?: string | null): string {
	return value && value.trim().length > 0 ? value : "Tidak terdeteksi";
}

interface CodebaseReviewEnvironmentPanelProps {
	analysis: CodebaseAnalysis;
}

export function CodebaseReviewEnvironmentPanel({
	analysis,
}: CodebaseReviewEnvironmentPanelProps) {
	const envRows: Array<[string, string | undefined | null]> = [
		["FRAMEWORK", analysis.framework],
		["LANGUAGE", analysis.language],
		["DATABASE", analysis.database],
		["AUTHENTICATION", analysis.auth],
		["PACKAGE MANAGER", analysis.packageManager],
	];

	return (
		<>
			{/* Panel 1: Detected environment */}
			<div className="rounded-xl border border-graphite bg-charcoal overflow-hidden flex flex-col shadow-sm">
				<div className="flex items-center justify-between border-b border-graphite p-4 sm:p-5">
					<h3 className="font-inter text-sm font-[600] text-snow">
						Detected environment
					</h3>
					<Icon
						icon={Tick01Icon}
						size={14}
						className="text-emerald-500 font-bold"
					/>
				</div>
				<div className="flex flex-col divide-y divide-graphite/60 p-0">
					{envRows.map(([label, value]) => {
						const valStr = valueOrUnknown(value);
						const isUnknown = valStr === "Tidak terdeteksi";
						return (
							<div
								key={label}
								className="flex items-center justify-between px-4 sm:px-5 py-3 text-xs"
							>
								<span className="font-mono text-[10px] text-slate tracking-wider">
									{label}
								</span>
								<strong
									className={`font-mono text-xs font-semibold ${
										isUnknown ? "text-slate italic font-normal" : "text-mist"
									}`}
								>
									{valStr}
								</strong>
							</div>
						);
					})}
				</div>
				{analysis.dependencies && analysis.dependencies.length > 0 && (
					<div className="border-t border-graphite/80 px-4 sm:px-5 py-3 bg-obsidian/40">
						<span className="block font-mono text-[10px] uppercase text-slate mb-1.5 tracking-wider">
							DEPENDENSI UTAMA
						</span>
						<div className="flex flex-wrap gap-1.5">
							{analysis.dependencies.map((dep) => (
								<span
									key={dep}
									className="rounded border border-graphite/80 bg-obsidian px-2 py-0.5 font-mono text-[11px] text-mist"
								>
									{dep}
								</span>
							))}
						</div>
					</div>
				)}
			</div>
		</>
	);
}
