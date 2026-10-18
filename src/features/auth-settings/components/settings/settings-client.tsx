"use client";

import { Link, useLocation } from "@tanstack/react-router";
import {
	ArrowLeft,
	Bell,
	CreditCard,
	KeyRound,
	MessageSquare,
	Shield,
	User,
} from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface SettingsClientProps {
	profile: unknown;
	children: React.ReactNode;
}

const NAV_ITEMS = [
	{ href: "/settings/profile", label: "Profil", icon: User },
	{ href: "/settings/account", label: "Akun", icon: Shield },
	{ href: "/settings/api-keys", label: "API Keys", icon: KeyRound },
	{ href: "/settings/notifications", label: "Notifikasi", icon: Bell },
	{ href: "/settings/billing", label: "Billing", icon: CreditCard },
	{ href: "/settings/feedback", label: "Feedback", icon: MessageSquare },
] as const;

export const SettingsClient = memo(function SettingsClient({
	children,
}: SettingsClientProps) {
	const pathname = useLocation({ select: (l) => l.pathname });

	return (
		<div className="flex min-h-screen flex-col bg-onyx text-snow md:flex-row">
			{/* Sidebar - fixed on the left for desktop, top for mobile */}
			<aside className="left-0 top-0 z-40 flex w-full shrink-0 flex-col border-b border-graphite bg-charcoal font-inter md:fixed md:bottom-0 md:w-64 md:border-r">
				<div className="p-4 md:p-8 md:pb-4 flex justify-between items-center md:block">
					<div>
						<h1 className="text-xl font-light text-snow md:text-2xl">
							Settings
						</h1>
						<p className="mt-1 text-xs text-fog md:text-sm">
							Manage account preferences
						</p>
					</div>
					<Link
						to="/"
						className="flex items-center justify-center rounded-md bg-white/5 p-2 text-fog transition-colors hover:bg-white/10 hover:text-snow md:hidden"
						title="Kembali"
						aria-label="Kembali"
					>
						<ArrowLeft size={20} />
					</Link>
				</div>

				<nav className="flex md:flex-1 md:flex-col flex-row gap-2 md:space-y-1.5 px-4 pb-4 md:pb-0 overflow-x-auto md:overflow-y-auto hide-scrollbar items-center md:items-stretch">
					{NAV_ITEMS.map((item) => {
						const Icon = item.icon;
						const isActive = pathname === item.href;
						return (
							<Link
								key={item.href}
								to={item.href}
								className={cn(
									"flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-[510] transition-all duration-300 md:gap-3 md:px-4 md:py-3 md:text-[15px]",
									isActive
										? "bg-obsidian text-snow shadow-[var(--shadow-inset)]"
										: "text-fog hover:bg-white/5 hover:text-snow",
								)}
							>
								<Icon
									size={18}
									className={isActive ? "text-mist" : "text-fog"}
								/>
								<span>{item.label}</span>
							</Link>
						);
					})}

					<div className="my-6 hidden h-px w-full bg-graphite md:block" />

					<Link
						to="/"
						className="hidden items-center gap-3 rounded-md px-4 py-3 text-[15px] font-[510] text-fog transition-all duration-300 hover:bg-white/5 hover:text-snow md:flex"
					>
						<ArrowLeft size={18} className="text-fog" />
						<span>Kembali</span>
					</Link>
				</nav>
			</aside>

			{/* Main Content - Pushed to the right of the sidebar on desktop */}
			<main className="flex-1 md:ml-64 p-4 sm:p-8 lg:p-12 w-full max-w-[100vw] overflow-x-hidden">
				<div className="w-full [&>div]:min-h-[calc(100vh-6rem)]">
					{children}
				</div>
			</main>
		</div>
	);
});
