"use client";

import { UserIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
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

export function StudioLandingProfile() {
	const { data: session } = authClient.useSession();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Profil dan tampilan"
					title="Profil dan tampilan"
					className="flex size-9 items-center justify-center rounded-full border border-graphite bg-charcoal text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{session?.user.image ? (
						<img
							src={session.user.image}
							alt=""
							className="size-8 rounded-full"
						/>
					) : (
						<Icon icon={UserIcon} size={16} aria-hidden />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>{session?.user.name ?? "Akun"}</DropdownMenuLabel>
				<DropdownMenuItem asChild>
					<Link to="/settings">Pengaturan akun</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<div className="flex items-center justify-between gap-4 px-2 py-1 text-sm text-fog">
					<span>Tampilan workspace</span>
					<ThemeToggle />
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
