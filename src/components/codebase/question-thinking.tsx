"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The one conversational Thinking surface for codebase question generation.
 *
 * Every line it shows is a client-observable fact about the real request:
 * the request was accepted, it is in flight, and the server either answered
 * or failed. It never rotates through invented "reasoning" paragraphs and it
 * never claims to read files — the backend only knows that the model is
 * generating, so that is exactly what is displayed.
 *
 * The elapsed timer measures wall-clock time since the request actually
 * started, so it can never run ahead of or behind the real call.
 */
export interface QuestionThinkingProps {
	/** Wall-clock start of the in-flight request, set by the owner. */
	startedAt?: number | null;
	/** Current activity line. Callers pass a genuine state description. */
	activity?: string;
	className?: string;
}

const DEFAULT_ACTIVITY = "Menunggu output model";

export function QuestionThinking({
	startedAt = null,
	activity = DEFAULT_ACTIVITY,
	className = "",
}: QuestionThinkingProps) {
	const [elapsedMs, setElapsedMs] = useState(() =>
		startedAt ? Math.max(0, Date.now() - startedAt) : 0,
	);

	useEffect(() => {
		if (!startedAt) return;
		const tick = () => setElapsedMs(Math.max(0, Date.now() - startedAt));
		tick();
		const timer = setInterval(tick, 500);
		return () => clearInterval(timer);
	}, [startedAt]);

	const elapsedSec = elapsedMs / 1000;

	return (
		<output
			data-testid="codebase-question-thinking"
			aria-live="polite"
			className={`flex flex-col gap-1 rounded-xl border border-graphite bg-charcoal p-3 ${className}`}
		>
			<span className="flex items-center gap-2">
				<Loader2
					size={13}
					className="shrink-0 animate-spin text-blue-400 motion-reduce:animate-none"
					aria-hidden="true"
				/>
				<span className="text-[12.5px] font-semibold text-snow">Thinking</span>
				<span
					role="timer"
					aria-label="Waktu proses"
					className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-fog"
				>
					{elapsedSec.toFixed(1)}s
				</span>
			</span>
			<span className="pl-[21px] text-[11.5px] leading-relaxed text-fog">
				{activity}
			</span>
		</output>
	);
}

export default QuestionThinking;
