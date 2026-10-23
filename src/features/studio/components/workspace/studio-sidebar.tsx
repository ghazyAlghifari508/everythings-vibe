"use client";

import {
	Cancel01Icon,
	ComputerIcon,
	Delete02Icon,
	File01Icon,
	Image01Icon,
	Loading01Icon,
	MoreHorizontalIcon,
	Search01Icon,
	SmartPhone01Icon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { StudioHistoryItem } from "@/features/studio/types/studio";

export type { StudioHistoryItem } from "@/features/studio/types/studio";

export interface StudioSidebarProps {
	history: StudioHistoryItem[];
	onSelectProject: (id: string) => void;
	onDeleteProject: (id: string) => Promise<void>;
	className?: string;
}

export function StudioSidebar({
	history,
	onSelectProject,
	onDeleteProject,
	className = "",
}: StudioSidebarProps) {
	const [query, setQuery] = useState("");
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [confirmTarget, setConfirmTarget] = useState<StudioHistoryItem | null>(
		null,
	);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return history;
		return history.filter((item) => item.title.toLowerCase().includes(trimmed));
	}, [history, query]);

	async function confirmDelete() {
		if (!confirmTarget || deletingId) return;
		const id = confirmTarget.id;
		setDeletingId(id);
		setDeleteError(null);
		try {
			await onDeleteProject(id);
			setConfirmTarget(null);
		} catch (failure) {
			setDeleteError(
				failure instanceof Error
					? failure.message
					: "Gagal menghapus project. Coba lagi.",
			);
		} finally {
			setDeletingId(null);
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
			<div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-2">
				{history.length === 0 ? (
					<div className="flex h-full min-h-[220px] flex-1 flex-col items-center justify-center p-6 text-center">
						<p className="text-xs font-semibold text-mist">
							Belum ada project studio.
						</p>
						<p className="mt-1 text-[11px] text-fog">
							Tulis deskripsi antarmuka di samping untuk memulai.
						</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="flex h-full min-h-[160px] flex-1 flex-col items-center justify-center p-4 text-center">
						<p className="text-xs text-fog">
							Tidak ada project yang cocok dengan &quot;
							<span className="text-snow">{query}</span>&quot;.
						</p>
					</div>
				) : (
					<ul className="space-y-1">
						{filtered.map((item) => {
							const isMobile = item.designMode === "mobile";
							const isDeleting = deletingId === item.id;
							const isMenuOpen = openMenuId === item.id;
							return (
								<li key={item.id}>
									<div
										data-state={
											isDeleting
												? "deleting"
												: isMenuOpen
													? "menu-open"
													: "idle"
										}
										className={`group flex items-stretch gap-1 rounded-lg border transition-colors ${
											isDeleting
												? "border-transparent opacity-60"
												: isMenuOpen
													? "border-iron bg-steel"
													: "border-transparent hover:border-graphite hover:bg-steel"
										}`}
									>
										<button
											type="button"
											onClick={() => onSelectProject(item.id)}
											disabled={isDeleting}
											className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed"
										>
											<div className="flex items-start justify-between gap-2">
												<span className="line-clamp-2 text-xs font-semibold text-snow">
													{item.title}
												</span>
												<span
													className="mt-0.5 shrink-0 text-fog"
													title={isMobile ? "Mobile Design" : "Web Design"}
												>
													{isMobile ? (
														<Icon
															icon={SmartPhone01Icon}
															size={13}
															aria-hidden
														/>
													) : (
														<Icon icon={ComputerIcon} size={13} aria-hidden />
													)}
												</span>
											</div>

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

										<DropdownMenu
											open={isMenuOpen}
											onOpenChange={(open) =>
												setOpenMenuId(open ? item.id : null)
											}
										>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													disabled={isDeleting}
													aria-label={`Aksi project ${item.title}`}
													className="my-1 mr-1 flex size-8 shrink-0 items-center justify-center self-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-50"
												>
													{isDeleting ? (
														<Icon
															icon={Loading01Icon}
															size={14}
															className="motion-safe:animate-spin"
															aria-hidden
														/>
													) : (
														<Icon
															icon={MoreHorizontalIcon}
															size={15}
															aria-hidden
														/>
													)}
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													className="text-crimson focus:text-crimson"
													onSelect={() => {
														setDeleteError(null);
														setConfirmTarget(item);
													}}
												>
													<Icon
														icon={Delete02Icon}
														size={14}
														aria-hidden
														className="mr-2"
													/>
													Hapus project
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<Dialog
				open={confirmTarget !== null}
				onOpenChange={(open) => {
					if (!open && !deletingId) {
						setConfirmTarget(null);
						setDeleteError(null);
					}
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Hapus project?</DialogTitle>
						<DialogDescription>
							{confirmTarget
								? `Project "${confirmTarget.title}" akan dihapus permanen beserta seluruh layar, riwayat revisi, dan asetnya. Tindakan ini tidak dapat dibatalkan.`
								: ""}
						</DialogDescription>
					</DialogHeader>
					{deleteError ? (
						<p role="alert" className="text-sm text-crimson">
							{deleteError}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								setConfirmTarget(null);
								setDeleteError(null);
							}}
							disabled={deletingId !== null}
						>
							Batal
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void confirmDelete()}
							disabled={deletingId !== null}
						>
							{deletingId ? "Menghapus..." : "Hapus project"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</aside>
	);
}
