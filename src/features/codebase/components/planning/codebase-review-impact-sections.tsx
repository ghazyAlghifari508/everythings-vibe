"use client";

import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";

interface CodebaseReviewImpactSectionsProps {
	analysis: CodebaseAnalysis;
}

export function CodebaseReviewImpactSections({
	analysis,
}: CodebaseReviewImpactSectionsProps) {
	const uncertainFindings = (analysis.findings ?? []).filter(
		(finding) => finding.uncertainty && finding.uncertainty.length > 0,
	);

	return (
		<>
			{analysis.impactAreas && analysis.impactAreas.length > 0 ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{analysis.impactAreas.map((area, idx) => (
						<div
							key={area}
							className="rounded-lg border border-graphite/80 bg-obsidian/60 p-3.5 flex flex-col gap-1"
						>
							<h4 className="font-inter text-xs font-semibold text-snow">
								{idx === 0
									? "Database & State"
									: idx === 1
										? "Application & Logic"
										: "Interface & Routing"}
							</h4>
							<p className="text-[11px] text-fog leading-relaxed">{area}</p>
						</div>
					))}
				</div>
			) : (
				<p className="text-slate italic text-xs">Tidak terdeteksi</p>
			)}

			{/* Findings & Uncertainties */}
			{analysis.findings && analysis.findings.length > 0 && (
				<div className="rounded-lg border border-graphite/60 bg-obsidian/40 p-4 flex flex-col gap-3">
					<span className="font-mono text-[10px] uppercase text-slate tracking-wider">
						TEMUAN DAN KETIDAKPASTIAN
					</span>
					<div className="flex flex-col gap-2.5">
						{analysis.findings.map((f) => (
							<div key={f.title} className="text-xs flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<span className="font-medium text-snow">{f.title}</span>
									{f.uncertainty && (
										<span className="inline-flex items-center rounded border border-amber-600/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
											Perlu verifikasi
										</span>
									)}
								</div>
								<span className="text-fog text-[11px] leading-relaxed">
									{f.detail}
								</span>
								{f.uncertainty && (
									<span className="text-slate text-[11px] italic">
										Perlu verifikasi: {f.uncertainty}
									</span>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{uncertainFindings.length === 0 &&
				analysis.findings &&
				analysis.findings.length > 0 && (
					<p className="text-[11px] text-fog italic">
						Semua temuan di atas tanpa ketidakpastian tercatat.
					</p>
				)}

			{analysis.limitations && analysis.limitations.length > 0 && (
				<div className="text-[11px] text-fog flex flex-col gap-1">
					<span className="text-slate font-mono text-[10px] uppercase">
						Keterbatasan:
					</span>
					{analysis.limitations.map((lim) => (
						<span key={lim}>• {lim}</span>
					))}
				</div>
			)}
		</>
	);
}
