"use client";

import {
	AlertCircleIcon,
	ArrowDown01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useId, useRef, useState } from "react";
import { Orb } from "@/components/ui/orb";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export type AgentOperationStatus = "idle" | "running" | "done" | "failed";
export type AgentOperationPhase = "thinking" | "generating";

export interface AgentThinkingProps {
	/** Current status of the operation */
	status?: AgentOperationStatus;
	/** Backward compatibility flag for working */
	working?: boolean;
	/** Whether the operation failed */
	failed?: boolean;
	/** Active stage phase: "thinking" vs "generating" */
	phase?: AgentOperationPhase | null;
	/** Label while in thinking phase */
	thinkingLabel?: string;
	/** Label while in generating phase */
	generatingLabel?: string;
	/** Settled label upon success */
	doneLabel?: string;
	/** Settled label upon failure */
	failedLabel?: string;
	/** Single honest activity description */
	activity?: string | null;
	/** Model reasoning streamed from SSE */
	thinkingText?: string | null;
	/** Server-reported failure message */
	error?: string | null;
	/** Retry callback if failed */
	onRetry?: () => void;
	/** Timestamp when the run actually started */
	startedAt?: number | string | Date;
	/** Timestamp when the run finished, freezes timer */
	finishedAt?: number | string | Date | null;
	/** Whether to display the timer */
	showTimer?: boolean;
	/** Callback when operation settles with final elapsed seconds */
	onSettle?: (elapsedSec: number) => void;
	className?: string;
}

function resolveEpoch(
	value: number | string | Date | undefined | null,
	fallback: number,
): number {
	if (value === undefined || value === null) return fallback;
	const epoch =
		value instanceof Date
			? value.getTime()
			: typeof value === "number"
				? value
				: Date.parse(value);
	return Number.isFinite(epoch) ? epoch : fallback;
}

export function AgentThinking({
	status,
	working: legacyWorking,
	failed: legacyFailed = false,
	phase = null,
	thinkingLabel = "Thinking",
	generatingLabel,
	doneLabel = "Selesai",
	failedLabel = "Gagal",
	activity,
	thinkingText,
	error,
	onRetry,
	startedAt,
	finishedAt,
	showTimer = true,
	onSettle,
	className,
}: AgentThinkingProps) {
	// Reconcile status from either status prop or legacy working/failed props
	const isWorking =
		status !== undefined ? status === "running" : Boolean(legacyWorking);
	const isFailed =
		status !== undefined ? status === "failed" : Boolean(legacyFailed);
	const isDone =
		status !== undefined ? status === "done" : !isWorking && !isFailed;

	const startedAtEpoch = resolveEpoch(startedAt, Date.now());
	const startedAtRef = useRef<number>(startedAtEpoch);
	const [elapsed, setElapsed] = useState<number>(0);
	const [detailsOpen, setDetailsOpen] = useState<boolean>(isWorking);
	const settledRef = useRef<boolean>(false);
	const detailsId = useId();

	// Keep startedAtRef in sync with prop changes
	useEffect(() => {
		if (startedAt === undefined) return;
		const epoch = resolveEpoch(startedAt, startedAtRef.current);
		startedAtRef.current = epoch;
		if (isWorking) {
			setElapsed(Math.max(0, (Date.now() - epoch) / 1000));
		}
	}, [startedAt, isWorking]);

	// Ticking timer: ONLY runs while isWorking is true
	useEffect(() => {
		if (!isWorking) return;
		const interval = setInterval(() => {
			setElapsed(Math.max(0, (Date.now() - startedAtRef.current) / 1000));
		}, 200);
		return () => clearInterval(interval);
	}, [isWorking]);

	// Compute exact settled duration from recorded finish timestamp if present
	const settledDuration =
		finishedAt !== undefined && finishedAt !== null
			? Math.max(
					0,
					(resolveEpoch(finishedAt, Date.now()) - startedAtRef.current) / 1000,
				)
			: null;

	const finalElapsed =
		!isWorking && settledDuration !== null ? settledDuration : elapsed;

	// Settle callback and auto-collapse details on finish, expand on run start
	useEffect(() => {
		if (isWorking) {
			settledRef.current = false;
			setDetailsOpen(true);
		} else if (isDone || isFailed) {
			if (!settledRef.current) {
				settledRef.current = true;
				onSettle?.(finalElapsed);
			}
			setDetailsOpen(false);
		}
	}, [isWorking, isDone, isFailed, finalElapsed, onSettle]);

	const hasThinking = Boolean(thinkingText && thinkingText.trim().length > 0);
	const hasActivity = Boolean(activity && activity.trim().length > 0);
	const hasExpandableContent = hasThinking || hasActivity;

	// If idle and not working, nothing to display
	if (status === "idle" && !isWorking) {
		return null;
	}

	const isGeneratingPhase = isWorking && phase === "generating";

	return (
		<div
			data-testid="agent-thinking"
			className={cn("flex flex-col gap-1.5 py-1 text-sm text-snow", className)}
		>
			{/* Case 1: Verified Generating Phase — shows finished Thinking line above active Generating line */}
			{isGeneratingPhase ? (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between gap-3 text-xs text-fog">
						<span className="flex items-center gap-2">
							<Icon
								icon={Tick01Icon}
								size={14}
								className="shrink-0 text-emerald"
								aria-hidden="true"
							/>
							<span>{thinkingLabel}</span>
						</span>
						{showTimer ? (
							<span
								role="timer"
								aria-label="Waktu proses thinking"
								className="font-mono text-[11px] tabular-nums text-fog/80"
							>
								{finalElapsed.toFixed(1)}s
							</span>
						) : null}
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-2 font-medium text-snow">
							<Orb state="working" size={16} />
							<span>
								{generatingLabel ?? activity ?? "Menyusun respons..."}
							</span>
						</span>
						{showTimer ? (
							<span
								role="timer"
								aria-label="Waktu proses"
								className="font-mono text-xs tabular-nums text-fog"
							>
								{finalElapsed.toFixed(1)}s
							</span>
						) : null}
					</div>
				</div>
			) : (
				/* Case 2: Standard Active Running, Done, or Failed */
				<div className="flex items-center justify-between gap-3">
					<span className="flex items-center gap-2">
						{isWorking ? (
							<Orb state="reasoning" size={16} />
						) : isFailed ? (
							<Icon
								icon={AlertCircleIcon}
								size={16}
								className="shrink-0 text-crimson"
								aria-hidden="true"
							/>
						) : (
							<Icon
								icon={Tick01Icon}
								size={16}
								className="shrink-0 text-emerald"
								aria-hidden="true"
							/>
						)}
						<output
							aria-live="polite"
							className={cn(
								"font-medium",
								isWorking
									? "text-snow"
									: isFailed
										? "text-crimson"
										: "text-snow",
							)}
						>
							{isWorking
								? `${thinkingLabel}...`
								: isFailed
									? failedLabel
									: doneLabel}
						</output>
					</span>
					{showTimer ? (
						<span
							role="timer"
							aria-label="Waktu proses"
							className="font-mono text-xs tabular-nums text-fog"
						>
							{finalElapsed.toFixed(1)}s
						</span>
					) : null}
				</div>
			)}

			{/* Expandable Activity / Reasoning Details */}
			{hasExpandableContent ? (
				<div className="flex flex-col gap-1 pl-6">
					<button
						type="button"
						onClick={() => setDetailsOpen((prev) => !prev)}
						aria-expanded={detailsOpen}
						aria-controls={detailsId}
						className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs text-fog hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
					>
						<Icon
							icon={ArrowDown01Icon}
							size={13}
							className={cn(
								"transition-transform duration-200",
								detailsOpen && "rotate-180",
							)}
							aria-hidden="true"
						/>
						<span>Aktivitas</span>
					</button>

					{detailsOpen ? (
						<div
							id={detailsId}
							className="mt-1 flex flex-col gap-1.5 rounded-md border border-graphite/40 bg-charcoal/30 p-2.5 text-xs text-fog"
						>
							{hasActivity ? (
								<p className="leading-relaxed text-snow/90">{activity}</p>
							) : null}
							{hasThinking ? (
								<pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-mist">
									{thinkingText}
								</pre>
							) : null}
						</div>
					) : null}
				</div>
			) : null}

			{/* Failure Message & Inline Retry */}
			{isFailed && error ? (
				<div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crimson/30 bg-crimson/10 p-2.5 text-xs text-crimson">
					<span role="alert">{error}</span>
					{onRetry ? (
						<button
							type="button"
							onClick={onRetry}
							className="inline-flex min-h-7 items-center rounded border border-crimson/40 px-2 text-[11px] font-medium text-crimson hover:bg-crimson/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
						>
							Coba lagi
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
