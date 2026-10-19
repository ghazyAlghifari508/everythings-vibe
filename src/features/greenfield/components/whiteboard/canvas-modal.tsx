"use client";

import { Cancel01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { LayoutNode } from "../../types/whiteboard";
import { COLORS } from "../../utils/whiteboard-layout";

export function ContainerModal({
	node,
	onClose,
}: {
	node: LayoutNode;
	onClose: () => void;
}) {
	const color = COLORS[node.colorIdx];
	const rows = node.rows ?? [];
	const isTasks = node.containerKind === "tasks";
	const tasks = node.tasks ?? [];
	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut; keyboard dismiss via the close button */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; keyboard dismiss via the close button */}
			<div
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200"
				onClick={onClose}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only, no action to keyboard-activate */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no action to keyboard-activate */}
				<div
					className={`w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border ${color?.border ?? "border-graphite"} bg-obsidian p-5 shadow-[var(--shadow-overlay)] animate-in zoom-in-95 duration-200`}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="mb-4 flex items-center gap-2">
						<div
							className={`h-2 w-2 shrink-0 rounded-full ${color?.badge ?? "bg-fog"}`}
						/>
						<p className="truncate font-inter text-sm font-[510] text-snow">
							{node.label}
							{node.ownerFeature ? ` · ${node.ownerFeature}` : ""}
							{!isTasks && node.subfeatureName
								? ` · ${node.subfeatureName}`
								: ""}
						</p>
						<span className="ml-auto shrink-0 text-xs tabular-nums text-fog">
							{node.doneRows ?? 0}/{node.totalRows ?? rows.length}
						</span>
						<button
							type="button"
							onClick={onClose}
							aria-label="Tutup daftar"
							className="shrink-0 text-fog transition-colors hover:text-snow"
						>
							<Icon icon={Cancel01Icon} size={18} />
						</button>
					</div>
					{isTasks ? (
						<ul className="space-y-3">
							{tasks.map((t) => {
								const isDone = t.status === "completed" || t.status === "done";
								return (
									<li
										key={t.name}
										className="rounded-lg border border-graphite/60 bg-charcoal/40 px-3 py-2.5"
									>
										<div className="flex items-center gap-2.5 font-inter text-sm text-snow">
											<span
												aria-hidden
												className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
													isDone
														? "border-emerald/60 bg-emerald/15 text-emerald"
														: "border-fog/40 bg-onyx/40 text-transparent"
												}`}
											>
												{isDone ? (
													<Icon icon={Tick01Icon} size={11} strokeWidth={3} />
												) : null}
											</span>
											<span
												className={`truncate ${isDone ? "text-snow/75" : "text-snow"}`}
											>
												{t.name}
											</span>
											{isDone ? (
												<span className="ml-auto shrink-0 rounded bg-emerald/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald">
													Selesai
												</span>
											) : null}
										</div>
										{t.subtasks.length > 0 ? (
											<ul className="mt-1.5 space-y-1 pl-5">
												{t.subtasks.map((s) => (
													<li key={s.name} className="text-xs text-fog">
														{s.name}
														{s.details.length > 0 ? (
															<ul className="mt-0.5 space-y-0.5 pl-3">
																{s.details.map((d) => (
																	<li
																		key={d}
																		className="text-[11px] text-fog/70"
																	>
																		– {d}
																	</li>
																))}
															</ul>
														) : null}
													</li>
												))}
											</ul>
										) : null}
									</li>
								);
							})}
						</ul>
					) : (
						<ul className="space-y-2">
							{rows.map((r) => (
								<li
									key={r.id}
									className="rounded-lg border border-graphite/60 bg-charcoal/40 px-3 py-2"
								>
									<p className="font-inter text-sm text-snow">{r.name}</p>
									{r.description ? (
										<p className="mt-0.5 text-xs leading-relaxed text-fog">
											{r.description}
										</p>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</>
	);
}
