"use client";

import {
	ArrowRight01Icon,
	CubeIcon,
	LayoutGridIcon,
	ListChecksIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { memo } from "react";
import { Icon } from "@/components/ui/icon";
import type { LayoutNode } from "../../types/whiteboard";
import { MAX_VISIBLE_CONTAINER_ROWS } from "../../utils/whiteboard-layout";
import { BoardHandle } from "./canvas-connectors";
import { FeatureIcon, faseBadgeClass } from "./whiteboard-icons";

export const RootNode = memo(function RootNode({ node }: { node: LayoutNode }) {
	return (
		<div
			className="absolute rounded-xl border border-graphite bg-charcoal/90 p-4 shadow-sm animate-fadeIn"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Produk ${node.label}`}
		>
			<div className="flex h-full items-center gap-3">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
					<Icon icon={CubeIcon} size={18} aria-hidden />
				</span>
				<span className="min-w-0">
					<span className="block truncate font-inter text-sm font-semibold text-snow">
						{node.label}
					</span>
					<span className="block text-[11px] text-fog">Perencanaan</span>
				</span>
			</div>
			<BoardHandle className="-right-[5px]" />
		</div>
	);
});

export const FeatureNode = memo(function FeatureNode({
	node,
}: {
	node: LayoutNode;
}) {
	const done = node.doneRows ?? 0;
	const total = node.totalRows ?? node.taskCount ?? 0;
	return (
		<div
			className="absolute rounded-xl border border-graphite bg-charcoal/90 shadow-sm animate-fadeIn"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Fitur ${node.label}, fase ${node.phase ?? "-"}, ${done} dari ${total} selesai`}
		>
			<BoardHandle className="-left-[5px]" />
			<div className="flex h-full items-center gap-2.5 px-3.5">
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
					<FeatureIcon label={node.label} size={16} />
				</span>
				<span className="min-w-0 flex-1">
					<span
						className="block truncate font-inter text-sm font-[510] leading-snug text-snow"
						title={node.label}
					>
						{node.label}
					</span>
					<span className="block text-[11px] leading-tight text-fog">
						Direncanakan ·{" "}
						<span className="tabular-nums">
							{done}/{total}
						</span>
					</span>
				</span>
				<span
					className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ${faseBadgeClass(node.phase)}`}
				>
					Fase {node.phase ?? "-"}
				</span>
			</div>
			<BoardHandle className="-right-[5px]" />
		</div>
	);
});

// ponytail: stable keys for the fixed-length skeleton rows so the shimmer list
// never needs array-index keys; length stays tied to MAX_VISIBLE_CONTAINER_ROWS.
const TASK_SKELETON_KEYS = Array.from(
	{ length: MAX_VISIBLE_CONTAINER_ROWS },
	(_, i) => `task-skeleton-${i}`,
);

export const ContainerNode = memo(function ContainerNode({
	node,
	onOpen,
}: {
	node: LayoutNode;
	onOpen: (node: LayoutNode) => void;
}) {
	const isTasks = node.containerKind === "tasks";
	const isSkeleton = node.isSkeleton === true;
	const rows = node.rows ?? [];
	const total = node.totalRows ?? rows.length;
	const visible = rows.slice(0, MAX_VISIBLE_CONTAINER_ROWS);
	const hasMore = !isSkeleton && total > MAX_VISIBLE_CONTAINER_ROWS;
	const owner = node.ownerFeature ?? node.subfeatureName ?? "";
	return (
		<div
			className="absolute flex flex-col rounded-xl border border-graphite bg-charcoal/90 p-3 shadow-sm animate-fadeIn"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={
				isSkeleton
					? `${node.label} ${owner}, sedang diproses`
					: `${node.label} ${owner}, ${node.doneRows ?? 0} dari ${total} selesai`
			}
		>
			<BoardHandle className="-left-[5px]" />
			<div className="flex items-center justify-between px-1 pb-2">
				<span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-fog">
					{isTasks ? (
						<Icon icon={ListChecksIcon} size={12} aria-hidden />
					) : (
						<Icon icon={LayoutGridIcon} size={12} aria-hidden />
					)}
					{node.label}
				</span>
				{isSkeleton ? (
					<span
						aria-hidden
						className="h-2.5 w-8 animate-pulse rounded bg-fog/10"
					/>
				) : (
					<span className="text-[11px] tabular-nums text-fog">
						{node.doneRows ?? 0}/{total}
					</span>
				)}
			</div>
			{isSkeleton ? (
				<div
					className="flex flex-1 animate-pulse flex-col justify-center gap-1.5"
					aria-hidden
				>
					{TASK_SKELETON_KEYS.map((key) => (
						<div
							key={key}
							className="flex items-center gap-2 rounded-md border border-white/5 bg-onyx/40 px-3 py-2"
						>
							<span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-fog/20 bg-fog/5" />
							<div className="h-2.5 flex-1 rounded bg-fog/10" />
						</div>
					))}
				</div>
			) : (
				<ul className="flex flex-1 flex-col justify-center gap-1.5">
					{visible.map((row) => (
						<li
							key={row.id}
							title={row.description ?? row.name}
							className="flex items-center gap-2 rounded-md border border-white/5 bg-onyx/60 px-3 py-2"
						>
							{isTasks ? (
								<span
									aria-hidden
									className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
										row.done
											? "border-emerald/60 bg-emerald/15 text-emerald"
											: "border-fog/40 bg-onyx/40 text-transparent"
									}`}
								>
									{row.done ? (
										<Icon icon={Tick01Icon} size={10} strokeWidth={3} />
									) : null}
								</span>
							) : (
								<span
									aria-hidden
									className={`h-1.5 w-1.5 shrink-0 rounded-[2px] ${row.done ? "bg-emerald" : "bg-fog/50"}`}
								/>
							)}
							<span
								className={`min-w-0 flex-1 truncate font-inter text-xs ${
									isTasks && row.done ? "text-snow/75" : "text-snow"
								}`}
							>
								{row.name}
							</span>
							{row.done ? (
								<span className="shrink-0 text-[10px] font-medium text-emerald/90">
									Selesai
								</span>
							) : null}
						</li>
					))}
				</ul>
			)}
			{hasMore ? (
				<div className="flex justify-end pt-1.5">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onOpen(node);
						}}
						onPointerDown={(e) => e.stopPropagation()}
						className="flex items-center gap-0.5 text-[11px] font-[510] text-indigo transition-colors hover:text-indigo/80"
					>
						Lihat semua ({total}){" "}
						<Icon icon={ArrowRight01Icon} size={11} aria-hidden />
					</button>
				</div>
			) : null}
			<BoardHandle className="-right-[5px]" />
		</div>
	);
});
