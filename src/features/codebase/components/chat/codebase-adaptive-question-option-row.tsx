"use client";

import { Checkbox, Description, Radio } from "@heroui/react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CodebaseAdaptiveQuestionOptionRowProps {
	/** Single-select uses HeroUI `Radio`, multi-select uses HeroUI `Checkbox`.
	 *  Both are React Aria fields, so selection, roving focus, and the
	 *  `aria-describedby` wiring come from the library instead of being rebuilt. */
	inputType: "radio" | "checkbox";
	/** Canonical option id — the stable identity selection is reported as. */
	value: string;
	disabled: boolean;
	heading: string;
	/** What choosing this option changes, announced as the option's description. */
	description?: string;
	recommended?: boolean;
	/** The revealed free-text field for the "Lainnya" option, rendered inside
	 *  that option's own card so no second card appears beside the list. */
	children?: ReactNode;
}

/** Card surface for one option. Selection is a border + surface + control
 *  change (never text colour alone), and the state comes from the field's own
 *  render props rather than a shadow copy of the selection state. */
const CARD =
	"rounded-lg border px-3.5 py-3 transition-colors focus-within:ring-2 focus-within:ring-indigo";

/** The shared two-column track: column 1 is the selection control's own width,
 *  column 2 is the text column. The card, the clickable label, the description,
 *  and any revealed field all declare the SAME track, so every line of an
 *  option starts on the text column instead of being positioned with a
 *  hand-tuned indent. */
const TRACK = "grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-0";
const CARD_GRID = cn(CARD, TRACK);
const CONTENT = cn(TRACK, "group/option col-span-2 cursor-pointer");

function cardClass(isSelected: boolean, isDisabled: boolean): string {
	return cn(
		CARD_GRID,
		isSelected
			? "border-indigo bg-indigo/10"
			: "border-graphite bg-obsidian hover:border-steel hover:bg-obsidian/80",
		isDisabled && "opacity-60",
	);
}

const CONTROL =
	"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-slate group-data-[selected]/option:border-indigo";

/** Dot inside the control. Only painted on a selected option, so the ring
 *  stays visible and the state does not rely on colour alone. */
const INDICATOR =
	"hidden size-1.5 rounded-full bg-indigo group-data-[selected]/option:block";

/** The heading row is the option's accessible name; the badge rides along in it
 *  as advice, never as a success signal. */
const HEADING_ROW =
	"col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1";
const HEADING = "text-[13px] font-medium leading-snug text-snow text-pretty";
/** The description stays OUTSIDE the clickable label so the option's accessible
 *  name stays the heading. Its place comes from the card's text column. */
const DESCRIPTION =
	"col-start-2 mt-1 text-[11.5px] leading-relaxed text-fog text-pretty";
/** Row for the revealed free-text field: the option's own text column. */
const CHILDREN_ROW = "col-start-2 mt-2 min-w-0";

/**
 * One selectable option as a rich choice card: selection control, heading,
 * lower-emphasis description, and an optional recommendation badge. The badge
 * is a neutral project Badge — a recommendation is advice, not a success
 * signal, so no emerald tint, glow, gradient, or blur.
 */
export function CodebaseAdaptiveQuestionOptionRow({
	inputType,
	value,
	disabled,
	heading,
	description,
	recommended = false,
	children,
}: CodebaseAdaptiveQuestionOptionRowProps) {
	const headingRow = (
		<span className={HEADING_ROW}>
			<span className={HEADING}>{heading}</span>
			{recommended ? (
				<Badge
					variant="subtle"
					className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold tracking-wide"
				>
					Rekomendasi
				</Badge>
			) : null}
		</span>
	);

	const rest = (
		<>
			{description ? (
				<Description className={DESCRIPTION}>{description}</Description>
			) : null}
			{children ? <div className={CHILDREN_ROW}>{children}</div> : null}
		</>
	);

	if (inputType === "checkbox") {
		return (
			<Checkbox
				value={value}
				isDisabled={disabled}
				className={({ isSelected, isDisabled }) =>
					cardClass(Boolean(isSelected), Boolean(isDisabled))
				}
			>
				<Checkbox.Content className={CONTENT}>
					<Checkbox.Control className={CONTROL}>
						<Checkbox.Indicator className={INDICATOR} />
					</Checkbox.Control>
					{headingRow}
				</Checkbox.Content>
				{rest}
			</Checkbox>
		);
	}

	return (
		<Radio
			value={value}
			isDisabled={disabled}
			className={({ isSelected, isDisabled }) =>
				cardClass(Boolean(isSelected), Boolean(isDisabled))
			}
		>
			<Radio.Content className={CONTENT}>
				<Radio.Control className={CONTROL}>
					<Radio.Indicator className={INDICATOR} />
				</Radio.Control>
				{headingRow}
			</Radio.Content>
			{rest}
		</Radio>
	);
}
