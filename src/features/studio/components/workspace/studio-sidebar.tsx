"use client";

import {
	Cancel01Icon,
	ComputerIcon,
	Copy01Icon,
	Delete02Icon,
	File01Icon,
	Folder02Icon,
	Image01Icon,
	Loading01Icon,
	MoreVerticalIcon,
	PencilEdit01Icon,
	Search01Icon,
	SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { StudioDeleteProjectDialog } from "@/features/studio/components/workspace/studio-delete-project-dialog";
import { StudioRenameProjectDialog } from "@/features/studio/components/workspace/studio-rename-project-dialog";
import type { StudioHistoryItem } from "@/features/studio/types/studio";

export type { StudioHistoryItem } from "@/features/studio/types/studio";

export interface StudioSidebarProps {
	history: StudioHistoryItem[];
	onSelectProject: (id: string) => void;
	onDeleteProject: (id: string) => Promise<void>;
	onRenameProject: (id: string, name: string) => Promise<void>;
	onDuplicateProject: (id: string) => Promise<void>;
	className?: string;
}

interface StudioHistoryEmptyProps {
	state: "history" | "search";
	icon: ComponentProps<typeof Icon>["icon"];
	title: string;
	description: string;
}

/**
 * Empty region for the history list. It starts at the same top edge and left
 * alignment the first project card would occupy, so an empty sidebar never
 * reads as a vertically centred placeholder. History and search keep separate
 * copy because only one of them means "you have no designs yet".
 */
function StudioHistoryEmpty({
	state,
	icon,
	title,
	description,
}: StudioHistoryEmptyProps) {
	return (
		<div
			data-studio-empty-state={state}
			className="flex flex-col gap-1.5 px-2.5 pt-2.5"
		>
			<div
				className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg border border-graphite/70 bg-onyx text-fog"
				aria-hidden="true"
			>
				<Icon icon={icon} size={16} />
			</div>
			<p className="text-xs font-semibold text-snow">{title}</p>
			<p className="text-[11px] leading-relaxed text-fog">{description}</p>
		</div>
	);
}

export function StudioSidebar({
	history,
	onSelectProject,
	onDeleteProject,
	onRenameProject,
	onDuplicateProject,
	className = "",
}: StudioSidebarProps) {
	const [query, setQuery] = useState("");
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] = useState<StudioHistoryItem | null>(
		null,
	);
	const [deleteTarget, setDeleteTarget] = useState<StudioHistoryItem | null>(
		null,
	);
	const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return history;
		return history.filter((item) => item.title.toLowerCase().includes(trimmed));
	}, [history, query]);

	// A project can disappear from the list while its dialog is open (deleted in
	// another tab, or by this very confirmation). Closing keeps the dialog from
	// writing against a row that no longer exists.
	useEffect(() => {
		const ids = new Set(history.map((item) => item.id));
		if (renameTarget && !ids.has(renameTarget.id)) setRenameTarget(null);
		if (deleteTarget && !ids.has(deleteTarget.id)) setDeleteTarget(null);
	}, [history, renameTarget, deleteTarget]);

	// Failures are reported by the caller as a toast, so this only prevents a
	// second request while the first copy is still being created.
	async function duplicateProject(item: StudioHistoryItem) {
		if (duplicatingId) return;
		setDuplicatingId(item.id);
		try {
			await onDuplicateProject(item.id);
		} finally {
			setDuplicatingId(null);
		}
	}

	return (
		<aside
			aria-label="Riwayat Project Studio"
			className={`flex flex-col overflow-hidden rounded-2xl border border-graphite bg-charcoal ${className}`}
		>
			{/* Sidebar Header */}
			<div className="flex shrink-0 items-center justify-between border-b border-graphite px-4 py-3.5">
				<div className="flex items-center gap-2">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-snow">
						My Projects
					</h2>
					<span className="rounded-full bg-onyx border border-graphite px-2 py-0.5 font-mono text-[10px] text-fog">
						{history.length}
					</span>
				</div>
			</div>

			{/* Search Input */}
			<div className="shrink-0 p-3 border-b border-graphite/60">
				<div className="relative flex items-center">
					<Icon
						icon={Search01Icon}
						size={14}
						className="absolute left-2.5 text-fog pointer-events-none"
						aria-hidden
					/>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape" && query) {
								e.preventDefault();
								setQuery("");
							}
						}}
						placeholder="Cari project..."
						aria-label="Cari project studio"
						className="w-full rounded-lg border border-graphite bg-onyx py-1.5 pl-8 pr-7 text-xs text-snow placeholder:text-fog focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
					/>
					{query ? (
						<button
							type="button"
							onClick={() => setQuery("")}
							aria-label="Hapus pencarian"
							className="absolute right-2 text-fog hover:text-snow"
						>
							<Icon icon={Cancel01Icon} size={13} aria-hidden />
						</button>
					) : null}
				</div>
			</div>

			{/* Project List */}
			<div
				data-studio-history-list
				className="flex flex-1 min-h-0 flex-col overflow-y-auto p-2"
			>
				{history.length === 0 ? (
					<StudioHistoryEmpty
						state="history"
						icon={Folder02Icon}
						title="Belum ada proyek"
						description="Desain yang kamu buat akan muncul di sini."
					/>
				) : filtered.length === 0 ? (
					<StudioHistoryEmpty
						state="search"
						icon={Search01Icon}
						title="Tidak ada proyek yang cocok"
						description="Coba kata kunci lain."
					/>
				) : (
					<ul className="space-y-1">
						{filtered.map((item) => {
							const isMobile = item.designMode === "mobile";
							const isDuplicating = duplicatingId === item.id;
							const isMenuOpen = openMenuId === item.id;
							return (
								<li key={item.id}>
									<div
										data-state={
											isDuplicating
												? "duplicating"
												: isMenuOpen
													? "menu-open"
													: "idle"
										}
										className={`group flex items-start justify-between rounded-lg border transition-colors ${
											isDuplicating
												? "border-transparent opacity-60"
												: isMenuOpen
													? "border-iron bg-steel"
													: "border-transparent hover:border-graphite hover:bg-steel"
										}`}
									>
										<button
											type="button"
											onClick={() => onSelectProject(item.id)}
											disabled={isDuplicating}
											className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed"
										>
											<span className="line-clamp-2 text-xs font-semibold text-snow">
												{item.title}
											</span>

											<div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-fog">
												<span>
													{new Date(item.createdAt).toLocaleDateString(
														"id-ID",
														{
															day: "numeric",
															month: "short",
														},
													)}
												</span>
												<span>·</span>
												<span className="uppercase tracking-wider">
													{isMobile ? "Mobile" : "Web"}
												</span>
												{item.hasDesignMd && (
													<span
														className="inline-flex items-center gap-0.5 rounded bg-charcoal px-1 py-0.5 text-mist border border-graphite/80"
														title="Menggunakan DESIGN.md"
													>
														<Icon icon={File01Icon} size={10} aria-hidden />
														<span>Ref</span>
													</span>
												)}
												{item.hasLogo && (
													<span
														className="inline-flex items-center gap-0.5 rounded bg-charcoal px-1 py-0.5 text-mist border border-graphite/80"
														title="Menggunakan Logo"
													>
														<Icon icon={Image01Icon} size={10} aria-hidden />
														<span>Logo</span>
													</span>
												)}
											</div>
										</button>

										<div className="mr-1.5 mt-1.5 flex shrink-0 items-center gap-0.5">
											<span
												className="flex size-7 items-center justify-center text-fog"
												title={isMobile ? "Mobile Design" : "Web Design"}
											>
												{isMobile ? (
													<Icon icon={SmartPhone01Icon} size={14} aria-hidden />
												) : (
													<Icon icon={ComputerIcon} size={14} aria-hidden />
												)}
											</span>

											<DropdownMenu
												open={isMenuOpen}
												onOpenChange={(open) =>
													setOpenMenuId(open ? item.id : null)
												}
											>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														disabled={isDuplicating}
														aria-label={`Aksi project ${item.title}`}
														className="flex size-7 items-center justify-center rounded-md text-fog transition-colors hover:bg-white/10 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
													>
														{isDuplicating ? (
															<Icon
																icon={Loading01Icon}
																size={14}
																className="motion-safe:animate-spin"
																aria-hidden
															/>
														) : (
															<Icon
																icon={MoreVerticalIcon}
																size={15}
																aria-hidden
															/>
														)}
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														className="gap-2"
														onSelect={() => setRenameTarget(item)}
													>
														<Icon
															icon={PencilEdit01Icon}
															size={14}
															aria-hidden
														/>
														Ganti nama
													</DropdownMenuItem>
													<DropdownMenuItem
														className="gap-2"
														disabled={duplicatingId !== null}
														onSelect={() => void duplicateProject(item)}
													>
														<Icon icon={Copy01Icon} size={14} aria-hidden />
														Duplikat project
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														className="gap-2 text-crimson focus:text-crimson"
														onSelect={() => setDeleteTarget(item)}
													>
														<Icon icon={Delete02Icon} size={14} aria-hidden />
														Hapus project
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<StudioRenameProjectDialog
				open={renameTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRenameTarget(null);
				}}
				name={renameTarget?.title ?? ""}
				onRename={(title) =>
					renameTarget
						? onRenameProject(renameTarget.id, title)
						: Promise.resolve()
				}
			/>

			<StudioDeleteProjectDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				name={deleteTarget?.title ?? ""}
				onDelete={() =>
					deleteTarget ? onDeleteProject(deleteTarget.id) : Promise.resolve()
				}
			/>
		</aside>
	);
}
