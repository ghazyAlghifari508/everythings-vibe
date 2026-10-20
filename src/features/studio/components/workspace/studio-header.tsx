import {
	ArrowDown01Icon,
	ArrowLeft01Icon,
	Copy01Icon,
	Delete02Icon,
	Download01Icon,
	Loading01Icon,
	Menu01Icon,
	PlusSignIcon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { authClient } from "@/lib/auth-client";

export function StudioHeader({
	title,
	duplicating,
	exporting,
	deleting,
	canExport,
	onDuplicate,
	onExport,
	onDelete,
	onAddFrame,
	designSystemControl,
}: {
	title: string;
	duplicating: boolean;
	exporting: boolean;
	deleting?: boolean;
	canExport: boolean;
	onDuplicate: () => void;
	onExport: () => void;
	onDelete?: () => Promise<void>;
	onAddFrame?: () => void;
	designSystemControl?: ReactNode;
}) {
	const { data: session } = authClient.useSession();
	const [isDeleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	// Each floating control carries its own restrained surface so it stays
	// legible over the dotted canvas without a full-width navbar background.
	const surface =
		"border border-iron/70 bg-charcoal/85 backdrop-blur-sm supports-[backdrop-filter]:bg-charcoal/70";
	const control = `inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:opacity-50 ${surface}`;
	const item = "gap-2 focus:bg-steel";
	async function confirmDelete() {
		if (!onDelete || deleting) return;
		setDeleteError(null);
		try {
			await onDelete();
			setDeleteOpen(false);
		} catch (failure) {
			setDeleteError(
				failure instanceof Error
					? failure.message
					: "Gagal menghapus project. Coba lagi.",
			);
		}
	}
	return (
		// Floating canvas header: the dotted canvas shows through behind it, so
		// there is no full-width navbar surface and no divider line. Only the
		// individual controls carry a surface, and the empty middle band is
		// pointer-transparent so it never swallows canvas pan/selection.
		<header
			className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-3 px-2 pt-[env(safe-area-inset-top)] sm:px-4"
			data-testid="studio-header"
		>
			<div className="pointer-events-auto flex min-w-0 items-center gap-2">
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
						{onAddFrame ? (
							<DropdownMenuItem className={item} onSelect={onAddFrame}>
								<Icon icon={PlusSignIcon} size={16} />
								Tambah Halaman
							</DropdownMenuItem>
						) : null}
						{designSystemControl}
						<DropdownMenuSeparator />
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
									disabled={deleting}
									onSelect={() => {
										setDeleteError(null);
										setDeleteOpen(true);
									}}
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

			<Dialog open={isDeleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Hapus project?</DialogTitle>
						<DialogDescription>
							{`Project "${title}" akan dihapus permanen beserta seluruh layar, riwayat revisi, dan asetnya. Tindakan ini tidak dapat dibatalkan.`}
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
							onClick={() => setDeleteOpen(false)}
							disabled={deleting}
						>
							Batal
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void confirmDelete()}
							disabled={deleting}
						>
							{deleting ? "Menghapus..." : "Hapus project"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</header>
	);
}
