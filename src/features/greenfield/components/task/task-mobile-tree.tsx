"use client";

import { Check, ChevronDown, Circle } from "lucide-react";
import type { TaskTree } from "@/features/greenfield/services/task-tree";

const FEATURE_ACCENTS = [
	"#6366f1",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#06b6d4",
	"#84cc16",
	"#f97316",
	"#14b8a6",
];

/** Mobile (<md) stacked accordion fallback for the task tree canvas. */
export function TaskMobileTree({ taskTree }: { taskTree: TaskTree }) {
	return (
		<div
			className="h-full overflow-y-auto md:hidden"
			style={{ overscrollBehavior: "contain" }}
		>
			<div className="space-y-3 p-3">
				{taskTree.features.map((feature, fi) => (
					<details
						key={feature.name}
						className="rounded-lg border border-graphite bg-obsidian"
					>
						<summary
							className="flex cursor-pointer items-center gap-2 px-3 py-2 font-inter text-sm font-[510]"
							style={{
								borderLeft: `3px solid ${FEATURE_ACCENTS[fi % FEATURE_ACCENTS.length]}`,
							}}
						>
							<ChevronDown size={14} /> {feature.name}
						</summary>
						<div className="border-t border-graphite px-3 py-2">
							{!feature.tasks || feature.tasks.length === 0 ? (
								<p className="text-xs text-fog italic">Tidak ada task</p>
							) : (
								<ul className="space-y-2">
									{feature.tasks.map((task) => {
										const isDone =
											task.status === "completed" || task.status === "done";
										return (
											<li key={`${feature.name}-${task.name}`}>
												<div className="flex items-center gap-2">
													<span
														aria-hidden
														className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
															isDone
																? "border-emerald/60 bg-emerald/15 text-emerald"
																: "border-fog/40 bg-onyx/40 text-transparent"
														}`}
													>
														{isDone ? (
															<Check size={10} className="stroke-[3]" />
														) : null}
													</span>
													<p
														className={`text-sm font-[510] ${isDone ? "text-snow/75" : "text-snow"}`}
													>
														{task.name}
													</p>
													{isDone ? (
														<span className="ml-auto shrink-0 text-[10px] font-medium text-emerald/90">
															Selesai
														</span>
													) : null}
												</div>
												{task.subtasks && task.subtasks.length > 0 && (
													<ul className="mt-1 space-y-1 pl-3">
														{task.subtasks.map((sub) => (
															<li
																key={`${task.name}-${sub.name}`}
																className="text-xs text-fog"
															>
																<div className="flex items-center gap-1.5">
																	<Circle
																		size={5}
																		className="shrink-0 fill-fog/40"
																	/>{" "}
																	{sub.name}
																</div>
																{sub.details && sub.details.length > 0 && (
																	<ul className="mt-0.5 space-y-0.5 pl-4">
																		{sub.details.map((detail, di) => (
																			<li
																				// biome-ignore lint/suspicious/noArrayIndexKey: detail strings can duplicate; index as tiebreaker
																				key={`${detail.substring(0, 30)}-${di}`}
																				className="text-[11px] text-fog/70"
																			>
																				– {detail}
																			</li>
																		))}
																	</ul>
																)}
															</li>
														))}
													</ul>
												)}
											</li>
										);
									})}
								</ul>
							)}
						</div>
					</details>
				))}
			</div>
		</div>
	);
}
