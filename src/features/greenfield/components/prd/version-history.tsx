"use client";

import {
	ArrowLeftRightIcon,
	ChevronDownIcon,
	HistoryIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { type Ref, useMemo } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Plan } from "@/types/database";
import { FEATURES } from "@/types/database";

interface PrdVersion {
	id: string;
	version: number;
	content: string;
	change_summary: string | null;
	created_at: string;
}

interface VersionHistoryProps {
	versions: PrdVersion[];
	currentVersion: number;
	onSelectVersion: (content: string, version: number) => void;
	onCompare?: () => void;
	triggerRef?: Ref<HTMLButtonElement>;
	disabled?: boolean;
	className?: string;
	plan?: Plan;
}

/**
 * One contextual control for the PRD document: version selection and the
 * compare action live in the same menu. Selection never mutates a document;
 * it only tells the parent which persisted record to show.
 */
export function VersionHistory({
	versions,
	currentVersion,
	onSelectVersion,
	onCompare,
	triggerRef,
	disabled = false,
	className,
	plan = "free",
}: VersionHistoryProps) {
	const hasHistoryAccess = FEATURES[plan].versionHistory !== false;

	// ponytail: the API orders newest first, but never trust list order for the
	// "Terbaru" marker — non-contiguous and stale lists must still be honest.
	const orderedVersions = useMemo(
		() =>
			versions
				.filter(
					(version) =>
						Number.isInteger(version.version) &&
						version.version > 0 &&
						typeof version.content === "string",
				)
				.sort((a, b) => b.version - a.version),
		[versions],
	);

	if (orderedVersions.length <= 1) return null;

	const latestVersion = orderedVersions[0]?.version;
	const canCompare =
		hasHistoryAccess && orderedVersions.length >= 2 && !!onCompare;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					ref={triggerRef}
					type="button"
					disabled={disabled}
					title={disabled ? "Nonaktif saat PRD masih dibuat" : undefined}
					aria-label={`Riwayat versi PRD, versi aktif ${currentVersion}`}
					className={cn(
						"flex min-h-11 items-center gap-1.5 rounded-md border border-iron/40 bg-charcoal/60 px-2.5 font-inter text-xs font-[510] text-fog transition-colors md:min-h-8",
						"hover:border-iron/70 hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
						"disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					<Icon icon={HistoryIcon} size={14} aria-hidden="true" />
					<span>Versi {currentVersion}</span>
					<Icon icon={ChevronDownIcon} size={14} aria-hidden="true" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuLabel className="px-3 py-2 text-xs font-[510] text-fog">
					Riwayat versi
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				{hasHistoryAccess ? (
					orderedVersions.map((version) => (
						<DropdownMenuItem
							key={version.id}
							role="menuitemradio"
							aria-checked={currentVersion === version.version}
							onSelect={() => onSelectVersion(version.content, version.version)}
							className="flex items-center justify-between gap-2"
						>
							<span className="flex items-center gap-2">
								<Icon
									icon={Tick01Icon}
									size={14}
									aria-hidden="true"
									className={
										currentVersion === version.version
											? "text-snow"
											: "text-transparent"
									}
								/>
								Versi {version.version}
							</span>
							{version.version === latestVersion && (
								<span className="text-xs text-fog">(Terbaru)</span>
							)}
						</DropdownMenuItem>
					))
				) : (
					<p className="px-3 py-2 text-xs text-fog">
						Upgrade ke Pro untuk melihat history revisi
					</p>
				)}

				{hasHistoryAccess && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={!canCompare}
							onSelect={() => onCompare?.()}
							className="flex items-center gap-2"
						>
							<Icon icon={ArrowLeftRightIcon} size={14} aria-hidden="true" />
							Bandingkan perubahan
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
