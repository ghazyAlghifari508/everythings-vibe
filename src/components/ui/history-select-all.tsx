import { useEffect, useRef } from "react";

/**
 * Page-level "select all" affordance shared by History surfaces.
 *
 * The checkbox covers the rows rendered on the current page and shows the
 * indeterminate state when only some of them are ticked. Extending the
 * selection to every filtered row is a separate, explicit action so the two
 * scopes can never be confused.
 */
export function HistorySelectAll({
	noun,
	pageIds,
	selectedIds,
	total,
	filteredScopeActive,
	preparing,
	onTogglePage,
	onSelectAllFiltered,
}: {
	noun: string;
	pageIds: readonly string[];
	selectedIds: ReadonlySet<string>;
	total: number;
	filteredScopeActive: boolean;
	preparing: boolean;
	onTogglePage: (selected: boolean) => void;
	onSelectAllFiltered: () => void;
}) {
	const checkboxRef = useRef<HTMLInputElement>(null);
	const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
	const pageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
	const partiallySelected = selectedOnPage > 0 && !pageSelected;
	const scopeAvailable =
		pageSelected && !filteredScopeActive && total > selectedIds.size;

	useEffect(() => {
		if (checkboxRef.current) {
			checkboxRef.current.indeterminate = partiallySelected;
		}
	}, [partiallySelected]);

	return (
		<div className="flex flex-col gap-2">
			<label className="inline-flex min-h-6 items-center gap-2 text-xs text-fog">
				<input
					ref={checkboxRef}
					type="checkbox"
					checked={pageSelected}
					onChange={(event) => onTogglePage(event.target.checked)}
					className="size-4 shrink-0 accent-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				/>
				<span>
					{pageSelected
						? `${selectedOnPage} ${noun} dipilih di halaman ini.`
						: "Pilih semua di halaman ini"}
				</span>
			</label>

			{scopeAvailable ? (
				<button
					type="button"
					onClick={onSelectAllFiltered}
					disabled={preparing}
					className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-3 text-xs font-medium text-snow transition-colors hover:border-fog/40 hover:text-snow disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{preparing ? (
						<span
							aria-hidden="true"
							className="size-3 animate-spin rounded-full border border-fog border-t-transparent"
						/>
					) : null}
					{preparing
						? "Menyiapkan pilihan"
						: `Pilih semua ${total} ${noun} sesuai filter`}
				</button>
			) : null}
		</div>
	);
}
