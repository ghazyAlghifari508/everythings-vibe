"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STUDIO_DESIGN_SKILLS } from "@/lib/studio-design-skills";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";

// Single-select skill menu. Exactly one skill is active at a time and the
// selection is a stable id the server validates against an allowlist, never a
// display label.
export function StudioSkillSelect({
	value,
	onChange,
	disabled = false,
}: {
	value: StudioDesignSkillId;
	onChange: (skillId: StudioDesignSkillId) => void;
	disabled?: boolean;
}) {
	const active =
		STUDIO_DESIGN_SKILLS.find((skill) => skill.id === value) ??
		STUDIO_DESIGN_SKILLS[0];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={`Design skill: ${active.label}`}
					title="Pilih design skill"
					className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-graphite bg-onyx px-2.5 py-1.5 text-xs font-semibold text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
				>
					<SlidersHorizontal size={14} aria-hidden />
					<span className="max-w-28 truncate">{active.label}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-80 w-72 overflow-y-auto"
			>
				<DropdownMenuLabel>Design Skill</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{STUDIO_DESIGN_SKILLS.map((skill) => {
					const selected = skill.id === value;
					return (
						<DropdownMenuItem
							key={skill.id}
							role="menuitemradio"
							aria-checked={selected}
							onSelect={() => onChange(skill.id)}
							className="items-start gap-2"
						>
							<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
								{selected ? <Check size={14} aria-label="Terpilih" /> : null}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm text-snow">
									{skill.label}
									{skill.id === "none" ? (
										<span className="ml-1.5 text-[10px] uppercase tracking-wider text-fog">
											Default
										</span>
									) : null}
								</span>
								<span className="block truncate text-xs text-fog">
									{skill.description}
								</span>
							</span>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
