"use client";

import {
	AlertCircleIcon,
	ArrowDown01Icon,
	Clock01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Orb } from "@/components/ui/orb";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
export type AgentOperationStatus =
	| "idle"
	| "queued"
	| "running"
	| "done"
	| "failed";

export interface AgentThinkingProps {
	/** Current status of the operation */
	status?: AgentOperationStatus;
	/** Backward compatibility flag for working */
	working?: boolean;
	/** Whether the operation failed */
	failed?: boolean;
	/** Label while the operation is in flight */
	thinkingLabel?: string;
	/** Label while the operation is accepted but no worker started it yet */
	queuedLabel?: string;
	/** Settled label upon success */
	doneLabel?: string;
	/** Settled label upon failure */
	failedLabel?: string;
	/**
	 * Reasoning the provider explicitly streamed to the client. This is the only
	 * expandable detail the component ever renders: transport milestones and
	 * backend housekeeping are diagnostics, not reasoning, so they are never
	 * accepted here. Empty means "no disclosure", not "empty disclosure".
	 */
	thinkingText?: string | null;
	/** Server-reported failure message */
	error?: string | null;
	/** Retry callback if failed */
	onRetry?: () => void;
	/** Timestamp when the run actually started; null while it is still queued */
	startedAt?: number | string | Date | null;
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

/**
 * One operation, one indicator. The single Orb in the headline is the whole
 * progress animation: the disclosure never repeats it, and no detail line is
 * invented from elapsed time. Details come only from real streamed reasoning.
 */
export function AgentThinking({
	status,
	working: legacyWorking,
	failed: legacyFailed = false,
	thinkingLabel = "Thinking",
	queuedLabel = "Menunggu proses generasi",
	doneLabel = "Selesai",
	failedLabel = "Gagal",
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
	// An accepted-but-unclaimed operation is queued: the worker has not started, so
	// no reasoning is claimed and no attempt clock is displayed for it.
	const isQueued = status !== undefined && status === "queued";
	const isWorking =
		status !== undefined ? status === "running" : Boolean(legacyWorking);
	const isFailed =
		status !== undefined ? status === "failed" : Boolean(legacyFailed);
	const isDone =
		status !== undefined
			? status === "done"
			: !isWorking && !isFailed && !isQueued;

	const startedAtEpoch = resolveEpoch(startedAt, Date.now());
	const startedAtRef = useRef<number>(startedAtEpoch);
	const [elapsed, setElapsed] = useState<number>(0);
	const [detailsOpen, setDetailsOpen] = useState<boolean>(isWorking);
	const settledRef = useRef<boolean>(false);
	const detailsId = useId();

	// Keep startedAtRef in sync with prop changes
	useEffect(() => {
		if (startedAt === undefined || startedAt === null) return;
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

	// The settle handler and the ticking duration change every render, so they are
	// read through a ref: depending on them below would re-run the disclosure
	// effect every 200ms and instantly undo a user's collapse.
	const settleRef = useRef({ onSettle, finalElapsed });
	settleRef.current = { onSettle, finalElapsed };

	// Expand once when a run starts, collapse once when it settles. Keyed only on
	// the status transition so a click during a run is never overwritten.
	useEffect(() => {
		if (isWorking) {
			settledRef.current = false;
			setDetailsOpen(true);
			return;
		}
		if (!isDone && !isFailed) return;
		if (!settledRef.current) {
			settledRef.current = true;
			settleRef.current.onSettle?.(settleRef.current.finalElapsed);
		}
		setDetailsOpen(false);
	}, [isWorking, isDone, isFailed]);

	const hasThinking = Boolean(thinkingText && thinkingText.trim().length > 0);

	// If idle and not working, nothing to display
	if (status === "idle" && !isWorking) {
		return null;
	}

	return (
		<div
			data-testid="agent-thinking"
			className={cn("flex flex-col gap-1.5 py-1 text-sm text-snow", className)}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="flex min-w-0 items-center gap-2">
					{isWorking ? (
						<span className="shrink-0" data-testid="agent-thinking-indicator">
							<Orb state="reasoning" size={16} />
						</span>
					) : isQueued ? (
						<Icon
							icon={Clock01Icon}
							size={16}
							className="shrink-0 text-fog"
							aria-hidden="true"
						/>
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
							"truncate font-medium",
							isFailed ? "text-crimson" : isQueued ? "text-fog" : "text-snow",
						)}
					>
						{isWorking
							? `${thinkingLabel}...`
							: isQueued
								? queuedLabel
								: isFailed
									? failedLabel
									: doneLabel}
					</output>
				</span>
				{showTimer && !isQueued ? (
					<span
						role="timer"
						aria-label="Waktu proses"
						className="font-mono text-xs tabular-nums text-fog"
					>
						{finalElapsed.toFixed(1)}s
					</span>
				) : null}
			</div>

			{/* Disclosure: only real provider-streamed reasoning, never transport logs */}
			{hasThinking ? (
				<div className="flex flex-col pl-6">
					<button
						type="button"
						onClick={() => setDetailsOpen((prev) => !prev)}
						aria-expanded={detailsOpen}
						aria-controls={detailsId}
						className="inline-flex min-h-11 w-full cursor-pointer items-center gap-1.5 text-left text-xs text-fog transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
					>
						<Icon
							icon={ArrowDown01Icon}
							size={14}
							className={cn(
								"shrink-0 transition-transform duration-200",
								detailsOpen && "rotate-180",
							)}
							aria-hidden="true"
						/>
						<span>Aktivitas</span>
					</button>

					{detailsOpen ? (
						<div
							id={detailsId}
							className="mb-1 flex flex-col gap-1.5 border-l border-graphite/50 pl-3 text-xs text-fog"
						>
							<pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-mist">
								{thinkingText}
							</pre>
						</div>
					) : null}
				</div>
			) : null}

			{/* Failure Message & Inline Retry */}
			{isFailed && error ? (
				<Alert
					variant="default"
					className="mt-2 rounded-xl border border-graphite/80 bg-charcoal p-3 text-xs text-snow shadow-none"
				>
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
						<div className="flex items-start gap-2 min-w-0">
							<Icon
								icon={AlertCircleIcon}
								size={15}
								aria-hidden="true"
								className="mt-0.5 shrink-0 text-crimson"
							/>
							<div className="flex flex-col gap-0.5 min-w-0">
								<span className="text-xs text-fog leading-relaxed">
									{error}
								</span>
							</div>
						</div>
						{onRetry ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={onRetry}
								className="shrink-0 h-7 border-graphite bg-obsidian px-2.5 font-mono text-[11px] text-snow hover:bg-graphite/30"
							>
								Coba lagi
							</Button>
						) : null}
					</div>
				</Alert>
			) : null}
		</div>
	);
}
