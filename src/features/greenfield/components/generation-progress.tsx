"use client";

import { ThoughtLine } from "@/components/ui/thought-line";
import { cn } from "@/lib/utils";

interface GenerationProgressProps {
	/** What is being generated, e.g. "PRD" or "Acceptance Criteria" */
	label: string;
	/** Real reasoning text streamed from the model's SSE `thinking` events. */
	thinkingText?: string;
	/** Real stream signal: true while the SSE stream is open. */
	isStreaming?: boolean;
	/** Real pipeline stages passed by the parent; defaults to two honest phases. */
	steps?: string[];
	/** Index into steps driven by the parent's real stream state. */
	activeStep?: number;
	className?: string;
}

const DEFAULT_STEPS = ["Menganalisis kebutuhan", "Menulis dokumen"];
const WAITING_COPY =
	"Sedang menganalisis kebutuhan dan menyusun dokumen. Dokumen akan langsung tampil di sini saat penulisan dimulai.";

export function GenerationProgress({
	label,
	thinkingText,
	isStreaming = true,
	steps,
	activeStep,
	className,
}: GenerationProgressProps) {
	// GenerationProgress hanya tampil sebelum konten pertama tiba (AcViewer
	// melepasnya saat delta pertama datang), jadi langkah aktif tetap 0.
	const resolvedSteps = steps ?? DEFAULT_STEPS;
	const resolvedActiveStep = activeStep ?? 0;
	const hasThinking = (thinkingText?.trim().length ?? 0) > 0;

	return (
		<div
			className={cn("mx-auto max-w-3xl px-4 sm:px-8 py-8 sm:py-12", className)}
		>
			<ThoughtLine
				working={isStreaming}
				label={`Menyusun ${label}`}
				doneLabel={`Menyusun ${label} selesai`}
				thinkingText={thinkingText}
				steps={resolvedSteps}
				activeStep={resolvedActiveStep}
			/>
			{!hasThinking ? (
				<p className="mt-3 text-xs text-fog leading-relaxed">{WAITING_COPY}</p>
			) : null}
		</div>
	);
}
