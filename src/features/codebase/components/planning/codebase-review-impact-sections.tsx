"use client";

import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";

interface CodebaseReviewImpactSectionsProps {
	analysis: CodebaseAnalysis;
}

export function CodebaseReviewImpactSections({
	analysis,
}: CodebaseReviewImpactSectionsProps) {
	const applicationModules = analysis.applicationModules ?? [];
	const impactAreas = analysis.impactAreas ?? [];
	const findings = analysis.findings ?? [];
	const uncertainFindings = findings.filter((finding) =>
		Boolean(finding.uncertainty && finding.uncertainty.trim().length > 0),
	);
	const limitations = analysis.limitations ?? [];
	const hasUncertainties =
		uncertainFindings.length > 0 || limitations.length > 0;

	return (
		<>
			{/* Bagian aplikasi: render structured modules or informative impact list */}
			{applicationModules.length > 0 ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
					{applicationModules.map((mod) => (
						<div
							key={mod.name}
							className="rounded-lg border border-graphite/80 bg-obsidian/60 p-3.5 flex flex-col gap-1"
						>
							<h4 className="font-inter text-xs font-semibold text-snow">
								{mod.name}
							</h4>
							<p className="text-[11px] text-fog leading-relaxed">
								{mod.description}
							</p>
						</div>
					))}
				</div>
			) : impactAreas.length > 0 ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
					{impactAreas.map((area) => (
						<div
							key={area}
							className="rounded-lg border border-graphite/80 bg-obsidian/60 p-3.5 flex flex-col justify-center"
						>
							<p className="text-xs text-mist leading-relaxed font-normal">
								{area}
							</p>
						</div>
					))}
				</div>
			) : (
				<p className="text-slate italic text-xs">Tidak terdeteksi</p>
			)}

			{/* Temuan arsitektur: fakta yang terbukti dari source */}
			{findings.length > 0 && (
				<div className="rounded-lg border border-graphite/60 bg-obsidian/40 p-4 flex flex-col gap-3">
					<span className="font-mono text-[10px] uppercase text-slate tracking-wider">
						Temuan arsitektur
					</span>
					<div className="flex flex-col gap-2.5">
						{findings.map((f) => (
							<div key={f.title} className="text-xs flex flex-col gap-1">
								<span className="font-medium text-snow">{f.title}</span>
								<span className="text-fog text-[11px] leading-relaxed">
									{f.detail}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Hal yang belum dapat dipastikan: batasan snapshot & aspek yang belum terverifikasi */}
			{hasUncertainties && (
				<div className="rounded-lg border border-graphite/60 bg-obsidian/40 p-4 flex flex-col gap-3">
					<span className="font-mono text-[10px] uppercase text-slate tracking-wider">
						Hal yang belum dapat dipastikan
					</span>
					<div className="flex flex-col gap-2.5">
						{uncertainFindings.map((f) => (
							<div
								key={`uncertain-${f.title}`}
								className="text-xs flex flex-col gap-0.5"
							>
								<span className="font-medium text-snow">{f.title}</span>
								<span className="text-fog text-[11px] leading-relaxed">
									{f.uncertainty}
								</span>
							</div>
						))}
						{limitations.map((lim) => (
							<div
								key={`limitation-${lim}`}
								className="text-[11px] text-fog leading-relaxed flex items-start gap-2"
							>
								<span className="text-slate select-none">•</span>
								<span>{lim}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</>
	);
}
