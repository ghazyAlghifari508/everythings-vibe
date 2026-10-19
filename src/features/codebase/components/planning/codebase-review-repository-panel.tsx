"use client";

import { FileCodeIcon, Folder01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";

function splitPath(fullPath: string): {
	dir: string;
	name: string;
	isFile: boolean;
} {
	const normalized = fullPath.trim();
	const isFile = /\.[a-z0-9]+$/i.test(normalized);
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) {
		return { dir: "", name: normalized, isFile };
	}
	return {
		dir: normalized.slice(0, lastSlash + 1),
		name: normalized.slice(lastSlash + 1),
		isFile,
	};
}

interface CodebaseReviewRepositoryPanelProps {
	analysis: CodebaseAnalysis;
	fileCount?: number;
	excludedCount?: number;
}

export function CodebaseReviewRepositoryPanel({
	analysis,
	fileCount,
	excludedCount,
}: CodebaseReviewRepositoryPanelProps) {
	return (
		<>
			{/* Panel 2: Repository map */}
			<div className="rounded-xl border border-graphite bg-charcoal overflow-hidden flex flex-col shadow-sm">
				<div className="flex items-center justify-between border-b border-graphite p-4 sm:p-5">
					<h3 className="font-inter text-sm font-[600] text-snow">
						Repository map
					</h3>
					<span className="font-mono text-[11px] text-fog">
						{fileCount === undefined ? "—" : fileCount} files indexed (
						{excludedCount === undefined ? "—" : excludedCount} excluded)
					</span>
				</div>
				<div className="p-4 sm:p-5 flex-1 flex flex-col gap-4 text-xs">
					{analysis.moduleMap && analysis.moduleMap.length > 0 ? (
						<div className="rounded-lg border border-graphite/60 bg-onyx/50 divide-y divide-graphite/40 overflow-hidden max-h-64 overflow-y-auto">
							{analysis.moduleMap.map((entry) => {
								const parsed = splitPath(entry.path);
								return (
									<div
										key={entry.path}
										className="group flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-3 py-2 text-xs transition-colors hover:bg-steel/10 dark:hover:bg-steel/20"
									>
										<div className="flex items-center gap-2 min-w-0 sm:max-w-[52%]">
											{parsed.isFile ? (
												<Icon
													icon={FileCodeIcon}
													size={14}
													className="text-slate shrink-0"
													aria-hidden="true"
												/>
											) : (
												<Icon
													icon={Folder01Icon}
													size={14}
													className="text-slate shrink-0"
													aria-hidden="true"
												/>
											)}
											<span
												className="font-mono text-[11px] truncate text-snow"
												title={entry.path}
											>
												{parsed.dir && (
													<span className="text-slate font-normal">
														{parsed.dir}
													</span>
												)}
												<strong className="font-semibold text-snow">
													{parsed.name}
												</strong>
											</span>
										</div>
										<span
											className="text-[11px] text-fog sm:text-right sm:max-w-[46%] truncate"
											title={entry.summary}
										>
											{entry.summary}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-slate italic text-xs">Tidak terdeteksi</p>
					)}

					{analysis.relevantFiles && analysis.relevantFiles.length > 0 && (
						<div className="mt-auto border-t border-graphite/60 pt-3 flex flex-col gap-2">
							<span className="font-mono text-[10px] uppercase text-slate tracking-wider">
								FILE RELEVAN ({analysis.relevantFiles.length})
							</span>
							<div className="rounded-lg border border-graphite/40 bg-onyx/30 divide-y divide-graphite/30 max-h-40 overflow-y-auto">
								{analysis.relevantFiles.map((file) => {
									const parsed = splitPath(file);
									return (
										<div
											key={file}
											className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-steel/10 dark:hover:bg-steel/20 transition-colors"
										>
											<Icon
												icon={FileCodeIcon}
												size={13}
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
									);
								})}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
}
