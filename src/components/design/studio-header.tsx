import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ChevronDown,
	Copy,
	Download,
	Loader2,
	Menu,
	User,
} from "lucide-react";
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
	canExport,
	onDuplicate,
	onExport,
}: {
	title: string;
	duplicating: boolean;
	exporting: boolean;
	canExport: boolean;
	onDuplicate: () => void;
	onExport: () => void;
}) {
	const { data: session } = authClient.useSession();
	const control =
		"inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm text-snow hover:bg-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow disabled:opacity-50";
	const item = "gap-2 focus:bg-steel";
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
		</header>
	);
}
