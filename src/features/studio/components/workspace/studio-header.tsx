import {
	ArrowDown01Icon,
	ArrowLeft01Icon,
	Copy01Icon,
	Delete02Icon,
	Download01Icon,
	Loading01Icon,
	Menu01Icon,
	PencilEdit01Icon,
	UndoIcon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { StudioDeleteProjectDialog } from "@/features/studio/components/workspace/studio-delete-project-dialog";
import { StudioRenameProjectDialog } from "@/features/studio/components/workspace/studio-rename-project-dialog";
import { useHydratedSession } from "@/features/studio/hooks/use-hydrated-session";
import type { StudioElementEditing } from "../../hooks/use-studio-element-editing";
import { StudioElementFeedback } from "./studio-element-feedback";

export function StudioHeader({
	title,
	duplicating,
	exporting,
	renaming,
	canExport,
	elementEditing,
	onDuplicate,
	onRename,
	onExport,
	onDelete,
}: {
	title: string;
	duplicating: boolean;
	exporting: boolean;
	renaming?: boolean;
	canExport: boolean;
	elementEditing?: StudioElementEditing;
	onDuplicate: () => void;
	onRename: (name: string) => Promise<void>;
	onExport: () => void;
	onDelete?: () => Promise<void>;
}) {
	const session = useHydratedSession();
	const [isDeleteOpen, setDeleteOpen] = useState(false);
	const [isRenameOpen, setRenameOpen] = useState(false);
	const projectMenuRef = useRef<HTMLButtonElement>(null);
	const undo = elementEditing?.undo;
	const control =
		"inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-iron/70 bg-charcoal px-3 text-sm text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:opacity-50";
	const item = "gap-2 focus:bg-steel";
	return (
		<header
			className="relative z-30 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 pt-[env(safe-area-inset-top)] sm:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
			data-testid="studio-header"
		>
			<div className="col-start-1 row-start-1 flex min-h-14 min-w-0 items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							ref={projectMenuRef}
							type="button"
							className={control}
							aria-label="Menu project"
							title="Menu project"
						>
							<Icon icon={Menu01Icon} size={18} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="max-w-[calc(100vw-16px)]"
					>
						<DropdownMenuItem asChild className={item}>
							<Link to="/design">
								<Icon icon={ArrowLeft01Icon} size={16} />
								Kembali ke Semua Project
							</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className={item}
							disabled={renaming}
							onSelect={() => setRenameOpen(true)}
						>
							<Icon icon={PencilEdit01Icon} size={16} />
							Ganti nama project
						</DropdownMenuItem>
						<DropdownMenuItem
							className={item}
							disabled={duplicating}
							onSelect={onDuplicate}
						>
							{duplicating ? (
								<Icon
									icon={Loading01Icon}
									size={16}
									className="motion-safe:animate-spin"
								/>
							) : (
								<Icon icon={Copy01Icon} size={16} />
							)}
							{duplicating ? "Menduplikasi project…" : "Duplicate Project"}
						</DropdownMenuItem>
						{undo && elementEditing ? (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuGroup aria-label="Riwayat revisi">
									<DropdownMenuLabel>Riwayat revisi</DropdownMenuLabel>
									<DropdownMenuItem
										className={item}
										disabled={elementEditing.busy}
										onSelect={() =>
											void elementEditing.transition(undo, "undo")
										}
									>
										<Icon icon={UndoIcon} size={16} className="shrink-0" />
										<span className="min-w-0 truncate" title={undo.frameName}>
											Undo revisi elemen: {undo.frameName}
										</span>
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</>
						) : null}
						{onDelete ? (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="gap-2 text-crimson focus:text-crimson"
									onSelect={() => setDeleteOpen(true)}
								>
									<Icon icon={Delete02Icon} size={16} />
									Hapus project
								</DropdownMenuItem>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
				<h1
					className="truncate text-sm font-semibold text-snow sm:text-base"
					title={title}
				>
					{title}
				</h1>
			</div>
			<div className="col-start-2 row-start-1 flex items-center gap-1 lg:col-start-3">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className={control}
							aria-label="Export project"
						>
							{exporting ? (
								<Icon
									icon={Loading01Icon}
									size={16}
									className="motion-safe:animate-spin"
								/>
							) : null}
							<span className="hidden sm:inline">Export</span>
							<Icon icon={ArrowDown01Icon} size={14} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="max-w-[calc(100vw-16px)]">
						<DropdownMenuItem
							className={item}
							disabled={!canExport || exporting}
							onSelect={onExport}
						>
							<Icon icon={Download01Icon} size={16} />
							{exporting ? "Menyiapkan ZIP…" : "Download ZIP"}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled className="flex-col items-start gap-1">
							<span>Implementasi AI Agent / Setup CLI</span>
							<span className="text-xs">Coming Soon</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className={control}
							aria-label="Profil dan tampilan"
							title="Profil dan tampilan"
						>
							{session?.user.image ? (
								<img
									src={session.user.image}
									alt=""
									className="size-7 rounded-full"
								/>
							) : (
								<Icon icon={UserIcon} size={18} />
							)}
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>
							{session?.user.name ?? "Akun"}
						</DropdownMenuLabel>
						<DropdownMenuItem asChild className={item}>
							<Link to="/settings">Pengaturan akun</Link>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<div className="flex items-center justify-between gap-4 px-2 py-1 text-sm text-fog">
							<span>Tampilan workspace</span>
							<ThemeToggle />
						</div>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{elementEditing ? (
				<div className="col-span-2 row-start-2 grid min-h-12 min-w-0 items-center lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:min-h-0">
					<StudioElementFeedback
						editing={elementEditing}
						onReturnFocus={() => projectMenuRef.current?.focus()}
					/>
				</div>
			) : null}

			<StudioRenameProjectDialog
				open={isRenameOpen}
				onOpenChange={setRenameOpen}
				name={title}
				onRename={onRename}
			/>

			{onDelete ? (
				<StudioDeleteProjectDialog
					open={isDeleteOpen}
					onOpenChange={setDeleteOpen}
					name={title}
					onDelete={onDelete}
				/>
			) : null}
		</header>
	);
}
