"use client";

import {
	BubbleChatIcon,
	CreditCardIcon,
	DashboardSquare01Icon,
	GitBranchIcon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Link, useLocation } from "@tanstack/react-router";
import type React from "react";
import { memo } from "react";
import { Icon, type IconProps } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

interface NavItem {
	href: string;
	label: string;
	icon: IconProps["icon"];
	isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
	{
		href: "/admin",
		label: "Ringkasan",
		icon: DashboardSquare01Icon,
		isActive: (p: string) => p === "/admin" || p === "/admin/",
	},
	{
		href: "/admin/users",
		label: "Pengguna",
		icon: UserGroupIcon,
		isActive: (p: string) =>
			p === "/admin/users" || p.startsWith("/admin/users/"),
	},
	{
		href: "/admin/feedback",
		label: "Tiket",
		icon: BubbleChatIcon,
		isActive: (p: string) =>
			p === "/admin/feedback" || p.startsWith("/admin/feedback/"),
	},
	{
		href: "/admin/projects",
		label: "Proyek",
		icon: GitBranchIcon,
		isActive: (p: string) =>
			p === "/admin/projects" || p.startsWith("/admin/projects/"),
	},
	{
		href: "/admin/transactions",
		label: "Transaksi",
		icon: CreditCardIcon,
		isActive: (p: string) =>
			p === "/admin/transactions" || p.startsWith("/admin/transactions/"),
	},
];

function AdminShellInner({ children }: { children: React.ReactNode }) {
	const pathname = useLocation({ select: (l) => l.pathname });

	return (
		<div className="flex min-h-screen flex-col bg-onyx font-inter text-snow">
			{/* Single Sticky Top-Nav Header */}
			<header className="sticky top-0 z-40 w-full border-b border-graphite bg-charcoal/95 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
					{/* Left: Admin Label + Single Nav Landmark */}
					<nav
						aria-label="Navigasi Admin"
						className="flex items-center gap-3 sm:gap-4 overflow-hidden min-w-0 flex-1"
					>
						<span className="text-sm font-[510] text-snow shrink-0 select-none">
							Admin
						</span>

						<div
							className="h-4 w-px bg-graphite/60 shrink-0"
							aria-hidden="true"
						/>

						<div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto hide-scrollbar py-1">
							{NAV_ITEMS.map((item) => {
								const isActive = item.isActive(pathname);

								return (
									<Link
										key={item.label}
										to={item.href}
										preload="intent"
										aria-current={isActive ? "page" : undefined}
										className={cn(
											"flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-[510] transition-colors",
											isActive
												? "border border-graphite/80 bg-obsidian text-snow shadow-[var(--shadow-inset)]"
												: "text-fog hover:bg-white/5 hover:text-snow",
										)}
									>
										<Icon
											icon={item.icon}
											size={14}
											className={isActive ? "text-snow" : "text-fog"}
										/>
										<span>{item.label}</span>
									</Link>
								);
							})}
						</div>
					</nav>

					{/* Right: Theme Toggle */}
					<div className="flex items-center gap-2 shrink-0">
						<ThemeToggle />
					</div>
				</div>
			</header>

			{/* Main Content Area */}
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
				{children}
			</main>
		</div>
	);
}

export const AdminClient = memo(function AdminClient({
	children,
}: {
	children: React.ReactNode;
}) {
	return <AdminShellInner>{children}</AdminShellInner>;
});
