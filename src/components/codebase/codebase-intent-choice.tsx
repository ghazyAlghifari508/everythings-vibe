"use client";

import type { ReactNode } from "react";
import type {
	CodebaseChatIntent,
	IntentOption,
} from "@/lib/codebase-revision-intent";

interface CodebaseIntentChoiceProps {
	options: IntentOption[];
	/** Currently chosen intent, null until the user picks one. */
	selected: CodebaseChatIntent | null;
	onSelect: (intent: CodebaseChatIntent) => void;
	/** Extra content shown for the selected intent, e.g. the impact warning. */
	children?: ReactNode;
}

/**
 * Explicit intent choice shown after a task plan exists.
 *
 * The workspace cannot infer whether the next message starts a new feature or
 * revises the current one — the two produce different persisted artifacts — so
 * the user always states it. The chosen intent stays visible while the message
 * is composed, so the consequence is readable before sending.
 */
export function CodebaseIntentChoice({
	options,
	selected,
	onSelect,
	children,
}: CodebaseIntentChoiceProps) {
	return (
		<div
			data-testid="codebase-intent-choice"
			className="rounded-xl border border-graphite bg-charcoal p-3"
		>
			<p className="text-[11px] font-semibold uppercase tracking-wider text-fog">
				Pesan berikutnya untuk apa?
			</p>
			<div className="mt-2 flex flex-col gap-1.5">
				{options.map((option) => {
					const checked = selected === option.intent;
					return (
						<label
							key={option.intent}
							data-testid={`codebase-intent-${option.intent}`}
							className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo ${
								checked
									? "border-indigo bg-indigo/10"
									: "border-graphite bg-obsidian hover:border-steel"
							}`}
						>
							<input
								type="radio"
								name="codebase-chat-intent"
								value={option.intent}
								checked={checked}
								onChange={() => onSelect(option.intent)}
								className="mt-0.5 size-3.5 shrink-0 accent-indigo"
							/>
							<span className="min-w-0">
								<span className="block text-[12.5px] font-semibold text-snow">
									{option.label}
								</span>
								<span className="mt-0.5 block text-[11px] leading-4 text-fog">
									{option.description}
								</span>
							</span>
						</label>
					);
				})}
			</div>
			{children}
		</div>
	);
}
