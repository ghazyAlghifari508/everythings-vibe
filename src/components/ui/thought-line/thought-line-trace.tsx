"use client";

import { ArrowDown01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useId } from "react";
import { Icon } from "../icon";

const MAX_THINKING_CHARS = 8000;
const THINKING_LABEL = "Proses Berpikir Model";

export interface ThoughtLineTraceProps {
	open: boolean;
	onToggle: () => void;
	working: boolean;
	steps: readonly string[];
	activeStep?: number;
	thinkingText?: string;
	collapsible: boolean;
}

/**
 * Fold-out reasoning trace: the real stage list, its completion indicators,
 * and the model's streamed reasoning panel with accessible toggle semantics.
 */
export function ThoughtLineTrace({
	open,
	onToggle,
	working,
	steps,
	activeStep,
	thinkingText,
	collapsible,
}: ThoughtLineTraceProps) {
	const traceId = useId();
	const hasThinking = (thinkingText?.trim().length ?? 0) > 0;
	const displayThinking =
		thinkingText && thinkingText.length > MAX_THINKING_CHARS
			? `...${thinkingText.slice(-MAX_THINKING_CHARS)}`
			: thinkingText;

	return (
		<div
			className="thought-line__trace"
			data-open={open ? "" : undefined}
			aria-hidden={!open}
		>
			<div className="thought-line__fold">
				{steps.length > 0 ? (
					<ol className="thought-line__steps">
						{steps.map((text, index) => {
							const done =
								!working ||
								(activeStep === undefined
									? index < steps.length - 1
									: index < activeStep);
							return (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: stage labels can repeat; position is the stable identity here
									key={`${index}-${text}`}
									className="thought-line__step"
									data-done={done ? "" : undefined}
								>
									<span className="thought-line__mark" aria-hidden="true">
										{done ? (
											<Icon icon={Tick01Icon} size="100%" strokeWidth={2.5} />
										) : (
											<i className="thought-line__pulse" />
										)}
									</span>
									<span className="thought-line__step-text">{text}</span>
								</li>
							);
						})}
					</ol>
				) : null}
				{hasThinking ? (
					<div className="thought-line__thinking">
						{collapsible ? (
							<button
								type="button"
								onClick={onToggle}
								aria-expanded={open}
								aria-controls={traceId}
								className="thought-line__thinking-toggle"
							>
								<span className="thought-line__thinking-label">
									{THINKING_LABEL}
								</span>
								<Icon
									icon={ArrowDown01Icon}
									size={14}
									className="shrink-0"
									aria-hidden
								/>
							</button>
						) : (
							<span className="thought-line__thinking-label">
								{THINKING_LABEL}
							</span>
						)}
						{open || !collapsible ? (
							<pre id={traceId} className="thought-line__thinking-body">
								{displayThinking}
							</pre>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
}
