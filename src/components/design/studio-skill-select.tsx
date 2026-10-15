"use client";

import { Check, CircleSlash, Eraser, Frame, Layers } from "lucide-react";
import type { ComponentType } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	STUDIO_DESIGN_SKILLS,
	type StudioDesignSkillAsset,
	type StudioDesignSkillIcon,
} from "@/lib/studio-design-skills";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";

// Fallback marks for skills without an official, licensable logo asset. These
// are deliberately distinct so each skill is visually identifiable; none of
// them claims to be a brand mark. See docs/studio-p2-component-discovery.md.
const FALLBACK_ICONS: Record<
	StudioDesignSkillIcon,
	ComponentType<{
		size?: number | string;
		"aria-hidden"?: boolean;
		className?: string;
	}>
> = {
	none: CircleSlash,
	"frontend-design": Frame,
	"ui-ux-pro-max": Layers,
	"anti-slop": Eraser,
};

// One consistent asset slot shared by every skill. Images and icons both render
// inside the same sized box so the menu stays visually regular.
function SkillAssetMark({ asset }: { asset: StudioDesignSkillAsset }) {
	if (asset.kind === "image") {
		return (
			<span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md">
				<img
					src={asset.src}
					alt={asset.alt}
					className="size-5 object-contain"
					loading="lazy"
					decoding="async"
				/>
			</span>
		);
	}
	const Icon = FALLBACK_ICONS[asset.icon];
	return (
		<span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-graphite bg-onyx text-mist">
			<Icon size={13} aria-hidden />
		</span>
	);
}

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
					<SkillAssetMark asset={active.asset} />
					<span className="max-w-28 truncate">{active.label}</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className="max-h-80 w-80 overflow-y-auto p-1.5"
			>
				<DropdownMenuLabel className="px-2.5">Design Skill</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{STUDIO_DESIGN_SKILLS.map((skill) => {
					const selected = skill.id === value;
					return (
						<DropdownMenuItem
							key={skill.id}
							role="menuitemradio"
							aria-checked={selected}
							onSelect={() => onChange(skill.id)}
							className={`items-start gap-2.5 px-2.5 py-2 ${
								selected ? "bg-white/5 text-snow" : "text-mist focus:text-snow"
							}`}
						>
							<span className="mt-0.5">
								<SkillAssetMark asset={skill.asset} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="flex items-center gap-1.5">
									<span className="truncate text-sm font-medium text-snow">
										{skill.label}
									</span>
									{skill.id === "none" ? (
										<span className="text-[10px] uppercase tracking-wider text-fog">
											Default
										</span>
									) : null}
								</span>
								<span className="mt-0.5 block truncate text-xs text-fog">
									{skill.description}
								</span>
							</span>
							<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
								{selected ? (
									<Check
										size={14}
										aria-label="Terpilih"
										className="text-snow"
									/>
								) : null}
							</span>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
