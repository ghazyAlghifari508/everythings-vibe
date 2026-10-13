"use client";

import { Check, LayoutGrid } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	STUDIO_DEFAULT_PAGE_COUNT,
	STUDIO_MAX_PAGE_COUNT,
	STUDIO_MIN_PAGE_COUNT,
} from "@/lib/studio-generation-options";

const PAGE_COUNT_OPTIONS: number[] = Array.from(
	{ length: STUDIO_MAX_PAGE_COUNT - STUDIO_MIN_PAGE_COUNT + 1 },
	(_, index) => STUDIO_MIN_PAGE_COUNT + index,
);

// Initial screen count for new project planning. Valid values are integers
// 1-5 and the server revalidates the selection before planning.
export function StudioPageCountSelect({
	value,
	onChange,
	disabled = false,
}: {
	value: number;
	onChange: (count: number) => void;
	disabled?: boolean;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={`Jumlah halaman awal: ${value}`}
					title="Pilih jumlah halaman awal"
					className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-graphite bg-onyx px-2.5 py-1.5 text-xs font-semibold text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
				>
					<LayoutGrid size={14} aria-hidden />
					<span>{value} halaman</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				<DropdownMenuLabel>Halaman awal</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{PAGE_COUNT_OPTIONS.map((count) => {
					const selected = count === value;
					return (
						<DropdownMenuItem
							key={count}
							role="menuitemradio"
							aria-checked={selected}
							onSelect={() => onChange(count)}
							className="gap-2"
						>
							<span className="flex size-4 shrink-0 items-center justify-center">
								{selected ? <Check size={14} aria-label="Terpilih" /> : null}
							</span>
							<span className="flex-1 text-sm text-snow">{count} halaman</span>
							{count === STUDIO_DEFAULT_PAGE_COUNT ? (
								<span className="text-[10px] uppercase tracking-wider text-fog">
									Default
								</span>
							) : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
