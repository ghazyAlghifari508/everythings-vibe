import {
	ArrowDown01Icon,
	ArrowLeft01Icon,
	BubbleChatIcon,
	Copy01Icon,
	Delete02Icon,
	Download01Icon,
	Loading01Icon,
	Menu01Icon,
	PencilEdit01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
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

export function StudioHeader({
	title,
	duplicating,
	exporting,
	renaming,
	canExport,
	onDuplicate,
	onRename,
	onExport,
	onDelete,
	chatOpen,
	onToggleChat,
}: {
	title: string;
	duplicating: boolean;
	exporting: boolean;
	renaming?: boolean;
	canExport: boolean;
	onDuplicate: () => void;
	onRename: (name: string) => Promise<void>;
	onExport: () => void;
	onDelete?: () => Promise<void>;
	chatOpen?: boolean;
	onToggleChat?: () => void;
}) {
	const session = useHydratedSession();
	const [isDeleteOpen, setDeleteOpen] = useState(false);
	const [isRenameOpen, setRenameOpen] = useState(false);
	const surface = "border border-iron/70 bg-charcoal";
	const control = `inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:opacity-50 ${surface}`;
	const item = "gap-2 focus:bg-steel";
	return (
		<header
			className="absolute inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-3 border-b border-iron bg-charcoal px-2 pt-[env(safe-area-inset-top)] sm:px-4"
			data-testid="studio-header"
		>
			<div className="pointer-events-auto flex min-w-0 items-center gap-2">
				{onToggleChat ? (
					<button
						id="studio-chat-toggle"
						type="button"
						className={control}
						onClick={onToggleChat}
						aria-label={chatOpen ? "Tutup panel chat" : "Buka panel chat"}
						aria-expanded={chatOpen}
					>
						<Icon icon={BubbleChatIcon} size={18} />
					</button>
				) : null}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
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
					className="truncate text-sm font-semibold text-snow [text-shadow:0_1px_2px_var(--color-charcoal)] sm:text-base"
					title={title}
				>
					{title}
				</h1>
			</div>
			<div className="pointer-events-auto flex shrink-0 items-center gap-1">
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
