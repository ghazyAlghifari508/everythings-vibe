import {
	AlertCircleIcon,
	ArrowDown01Icon,
	ArrowUp01Icon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { StudioFrameRow, StudioMessageRow } from "@/db/schema";
import { cn } from "@/lib/utils";
import { useStudioThumbnail } from "../../hooks/use-studio-thumbnail";
import {
	describeStudioResult,
	describeStudioStatus,
	type StudioResultRow,
	studioThumbnailGeometry,
} from "../../utils/studio-chat-message";

interface ResultProps {
	message: StudioMessageRow;
	frames: readonly StudioFrameRow[];
	onOpenFrame: (frameId: string) => void;
}

const PLATFORM_LABEL = { web: "Web UI", mobile: "Mobile UI" } as const;
const ROW_STATUS = {
	failed: "Belum berhasil",
	pending: "Sedang dibuat",
} as const;

/** A scaled, script-free render of the committed HTML. Decorative: the row text names the screen. */
function Thumbnail({
	row,
	frame,
}: {
	row: StudioResultRow;
	frame: StudioFrameRow | undefined;
}) {
	const geometry = studioThumbnailGeometry(row.platform);
	const state = useStudioThumbnail({
		projectId: frame?.projectId ?? "",
		frameId: frame?.id ?? null,
		revision: frame?.revision ?? 0,
		enabled: row.status === "ready" && Boolean(frame?.htmlCode),
	});
	return (
		<span
			data-testid="studio-result-thumbnail"
			data-state={state.status}
			aria-hidden="true"
			className="relative block shrink-0 overflow-hidden rounded-md border border-iron/70 bg-steel"
			style={{ width: geometry.boxWidth, height: geometry.boxHeight }}
		>
			{state.status === "ready" ? (
				<iframe
					title={`Pratinjau ${row.name}`}
					tabIndex={-1}
					sandbox=""
					referrerPolicy="no-referrer"
					loading="lazy"
					srcDoc={state.document.html}
					className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
					style={{
						width: geometry.documentWidth,
						height: geometry.documentHeight,
						transform: `scale(${geometry.scale})`,
					}}
				/>
			) : state.status === "loading" ? (
				<span className="absolute inset-0 flex items-center justify-center text-fog">
					<Spinner size={12} />
				</span>
			) : null}
		</span>
	);
}

function ResultRow({
	row,
	frame,
	onOpenFrame,
}: {
	row: StudioResultRow;
	frame: StudioFrameRow | undefined;
	onOpenFrame: (frameId: string) => void;
}) {
	const statusText =
		row.status === "ready"
			? row.changedSince
				? "Sudah diubah lagi"
				: null
			: ROW_STATUS[row.status];
	const content = (
		<>
			<Thumbnail row={row} frame={frame} />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
				<span className="truncate text-sm text-snow" title={row.name}>
					{row.name}
				</span>
				<span className="truncate text-xs text-fog">
					{PLATFORM_LABEL[row.platform]}
					{statusText ? ` · ${statusText}` : ""}
				</span>
				{row.frameId ? (
					<span className="text-xs text-fog underline underline-offset-2">
						Buka di canvas
					</span>
				) : (
					<span className="text-xs text-fog">Tidak ada di canvas</span>
				)}
			</span>
		</>
	);
	const frameId = row.frameId;
	return frameId ? (
		<button
			type="button"
			aria-label={`${row.name}, ${PLATFORM_LABEL[row.platform]}${statusText ? `, ${statusText}` : ""}. Buka di canvas`}
			onClick={() => onOpenFrame(frameId)}
			className="flex min-h-11 w-full items-center gap-3 rounded-lg p-1.5 hover:bg-steel focus-visible:outline-2 focus-visible:outline-snow"
		>
			{content}
		</button>
	) : (
		<div
			role="img"
			aria-label={`${row.name}, ${PLATFORM_LABEL[row.platform]}. Tidak ada di canvas`}
			className="flex min-h-11 w-full items-center gap-3 rounded-lg p-1.5 opacity-70"
		>
			{content}
		</div>
	);
}

/**
 * Result of one operation: the real frames it produced, with a thumbnail made
 * from each frame's committed HTML. The status line is separate from the
 * authored explanation above it and carries job state only.
 */
export function StudioChatResult({
	message,
	frames,
	onOpenFrame,
}: ResultProps) {
	const [open, setOpen] = useState(true);
	const bodyId = useId();
	const status = describeStudioStatus(message);
	const card = message.progress
		? describeStudioResult(message.progress, frames)
		: null;
	const byId = new Map(frames.map((frame) => [frame.id, frame]));
	const lead = status.running ? (
		<Spinner size={12} />
	) : (
		<Icon
			icon={message.status === "completed" ? Tick02Icon : AlertCircleIcon}
			size={14}
			className="shrink-0 text-fog"
		/>
	);
	const statusLine = (
		<output className="mt-3 flex min-h-6 items-center gap-2 text-xs text-fog">
			{lead}
			<span className="min-w-0 truncate">{status.label}</span>
		</output>
	);
	if (!card) return statusLine;
	return (
		<>
			<section
				aria-label="Hasil desain"
				className="mt-3 rounded-xl border border-iron/70 bg-charcoal/60 text-sm text-snow"
			>
				<h3 className="m-0 text-sm font-normal">
					<button
						type="button"
						aria-expanded={open}
						aria-controls={bodyId}
						onClick={() => setOpen((value) => !value)}
						className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left focus-visible:outline-2 focus-visible:outline-snow"
					>
						<span className="min-w-0 truncate">{card.title}</span>
						<Icon
							icon={open ? ArrowUp01Icon : ArrowDown01Icon}
							size={16}
							className="shrink-0 text-fog"
						/>
					</button>
				</h3>
				<ul
					id={bodyId}
					hidden={!open}
					className={cn("space-y-0.5 px-1.5 pb-1.5", !open && "hidden")}
				>
					{card.rows.map((row) => (
						<li key={row.key} className="min-w-0">
							<ResultRow
								row={row}
								frame={row.frameId ? byId.get(row.frameId) : undefined}
								onOpenFrame={onOpenFrame}
							/>
						</li>
					))}
				</ul>
			</section>
			{statusLine}
		</>
	);
}
