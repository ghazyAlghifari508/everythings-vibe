"use client";

import {
	ArrowDown01Icon,
	ArrowRight01Icon,
	FileCodeIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
	type CodebaseAnalysis,
	type CodebaseAnalysisFinding,
	getFindingEvidencePaths,
	getFindingImplication,
} from "@/features/codebase/services/analysis";

function splitPath(fullPath: string): { dir: string; name: string } {
	const normalized = fullPath.trim();
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) {
		return { dir: "", name: normalized };
	}
	return {
		dir: normalized.slice(0, lastSlash + 1),
		name: normalized.slice(lastSlash + 1),
	};
}

function FindingRow({
	finding,
	onSelectFile,
}: {
	finding: CodebaseAnalysisFinding;
	onSelectFile?: (path: string) => void;
}) {
	const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
	const evidencePaths = getFindingEvidencePaths(finding);
	const implication = getFindingImplication(finding);
	const hasEvidence = evidencePaths.length > 0;

	return (
		<div
			className="text-xs flex flex-col gap-1.5 p-3 rounded-lg border border-graphite/40 bg-onyx/30"
			data-testid="finding-row"
		>
			<div className="flex items-start justify-between gap-2">
				<span className="font-medium text-snow text-xs sm:text-sm">
					{finding.title}
				</span>
			</div>
			<p className="text-fog text-[11px] sm:text-xs leading-relaxed">
				{finding.detail}
			</p>

			{hasEvidence && (
				<div className="flex flex-col gap-1.5 mt-0.5">
					<button
						type="button"
						onClick={() => setIsEvidenceOpen((prev) => !prev)}
						aria-expanded={isEvidenceOpen}
						className="inline-flex items-center gap-1.5 text-[11px] text-fog hover:text-snow transition-colors cursor-pointer py-0.5 group self-start"
					>
						<span className="font-mono text-[10px] text-slate uppercase tracking-wider">
							Evidence:
						</span>
						<span>{evidencePaths.length} berkas relevan</span>
						<Icon
							icon={isEvidenceOpen ? ArrowDown01Icon : ArrowRight01Icon}
							size={12}
							className="text-slate group-hover:text-snow transition-transform"
							aria-hidden="true"
						/>
					</button>

					{isEvidenceOpen && (
						<div
							className="flex flex-col gap-1 pl-2 border-l border-graphite/60 mt-0.5"
							data-testid="finding-evidence-list"
						>
							{evidencePaths.map((file) => {
								const parsed = splitPath(file);
								return (
									<div
										key={file}
										className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-obsidian/60 border border-graphite/40 text-[11px]"
									>
										<div className="flex items-center gap-1.5 min-w-0">
											<Icon
												icon={FileCodeIcon}
												size={12}
												className="text-slate shrink-0"
												aria-hidden="true"
											/>
											<span
												className="font-mono text-[11px] text-snow truncate"
												title={file}
											>
												{parsed.dir && (
													<span className="text-slate font-normal">
														{parsed.dir}
													</span>
												)}
												<strong className="font-medium text-snow">
													{parsed.name}
												</strong>
											</span>
										</div>
										{onSelectFile && (
											<button
												type="button"
												onClick={() => onSelectFile(file)}
												className="text-[10px] text-fog hover:text-snow hover:underline font-mono px-1 py-0.5 shrink-0 cursor-pointer"
												title={`Lihat pratinjau ${file}`}
											>
												Lihat file
											</button>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{implication && (
				<div className="flex items-start gap-1.5 text-[11px] text-fog leading-relaxed mt-0.5">
					<span className="font-mono text-[10px] text-slate uppercase tracking-wider shrink-0 mt-0.5">
						Impact:
					</span>
					<span className="text-mist">{implication}</span>
				</div>
			)}
		</div>
	);
}

interface CodebaseReviewImpactSectionsProps {
	analysis: CodebaseAnalysis;
	onSelectFile?: (path: string) => void;
}

export function CodebaseReviewImpactSections({
	analysis,
	onSelectFile,
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
							className="rounded-lg border border-graphite/80 bg-obsidian/60 p-3.5 flex flex-col gap-1"
						>
							<p className="text-xs text-snow font-medium leading-relaxed">
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
							<FindingRow
								key={f.title}
								finding={f}
								onSelectFile={onSelectFile}
							/>
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
