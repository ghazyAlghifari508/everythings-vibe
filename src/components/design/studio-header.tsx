import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ChevronDown,
	Copy,
	Download,
	Loader2,
	Menu,
	Plus,
	Trash2,
	User,
} from "lucide-react";
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
	const control =
		"inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:opacity-50";
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
		<header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 bg-charcoal px-2 sm:px-4">
			<div className="flex min-w-0 items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className={control}
							aria-label="Menu project"
							title="Menu project"
						>
							<Menu size={18} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="max-w-[calc(100vw-16px)]"
					>
						<DropdownMenuItem asChild className={item}>
							<Link to="/design/studio">
								<ArrowLeft size={16} />
								Kembali ke Semua Project
							</Link>
						</DropdownMenuItem>
						{onAddFrame ? (
							<DropdownMenuItem className={item} onSelect={onAddFrame}>
								<Plus size={16} />
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
								<Loader2 size={16} className="motion-safe:animate-spin" />
							) : (
								<Copy size={16} />
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
									<Trash2 size={16} />
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
			<div className="flex shrink-0 items-center gap-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className={control}
							aria-label="Export project"
						>
							{exporting ? (
								<Loader2 size={16} className="motion-safe:animate-spin" />
							) : null}
							Export
							<ChevronDown size={14} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="max-w-[calc(100vw-16px)]">
						<DropdownMenuItem
							className={item}
							disabled={!canExport || exporting}
							onSelect={onExport}
						>
							<Download size={16} />
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
								<User size={18} />
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
