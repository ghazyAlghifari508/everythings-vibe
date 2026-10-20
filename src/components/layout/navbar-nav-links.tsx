import { Link } from "@tanstack/react-router";
import {
	isVibeDesignHistoryActive,
	isVibeDesignScrapActive,
	isVibeDesignScrapRoute,
} from "@/lib/design-nav";

const GLOBAL_NAV_LINKS = [
	{ to: "/pricing", label: "Pricing" },
	{ to: "/bantuan", label: "Bantuan" },
	{ to: "/faq", label: "FAQ" },
] as const;

export function NavbarNavLinks({
	pathname,
	isGreenfieldWorkspace,
	mobile = false,
	onNavigate,
}: {
	pathname: string;
	isGreenfieldWorkspace: boolean;
	mobile?: boolean;
	onNavigate?: () => void;
}) {
	const scrape = isVibeDesignScrapRoute(pathname);
	const linkClass = (active: boolean, scoped = false) =>
		mobile
			? `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-[510] ${active ? "bg-white/10 text-snow" : "text-snow hover:bg-white/5"}`
			: `rounded-md px-3 py-1.5 text-sm ${scoped ? "font-medium " : ""}transition-colors ${active ? "bg-white/10 text-snow" : "text-fog hover:bg-white/5 hover:text-snow"}`;

	return (
		<>
			{mobile && (
				<Link
					to="/"
					className={linkClass(pathname === "/")}
					onClick={onNavigate}
				>
					Home
				</Link>
			)}
			{scrape ? (
				<>
					<Link
						to="/scrape"
						className={linkClass(isVibeDesignScrapActive(pathname), true)}
						onClick={onNavigate}
					>
						VibeScrape
					</Link>
					<Link
						to="/scrape/history"
						className={linkClass(isVibeDesignHistoryActive(pathname), true)}
						onClick={onNavigate}
					>
						Riwayat
					</Link>
				</>
			) : isGreenfieldWorkspace ? (
				<>
					<Link
						to="/plan/new"
						className={linkClass(pathname === "/plan/new", true)}
						onClick={onNavigate}
					>
						Chat
					</Link>
					<Link
						to="/history"
						search={{ workspace: "greenfield" }}
						className={linkClass(pathname === "/history", true)}
						onClick={onNavigate}
					>
						Riwayat
					</Link>
				</>
			) : (
				GLOBAL_NAV_LINKS.map(({ to, label }) => (
					<Link
						key={to}
						to={to}
						className={linkClass(
							pathname === to || pathname.startsWith(`${to}/`),
						)}
						onClick={onNavigate}
					>
						{label}
					</Link>
				))
			)}
			{mobile && !scrape && (
				<>
					{!isGreenfieldWorkspace && (
						<Link
							to="/history"
							className={linkClass(pathname === "/history")}
							onClick={onNavigate}
						>
							Riwayat
						</Link>
					)}
					<Link
						to="/settings"
						className={linkClass(pathname.startsWith("/settings"))}
						onClick={onNavigate}
					>
						Settings
					</Link>
				</>
			)}
		</>
	);
}

// Keep export alias for any legacy references
export { NavbarNavLinks as NavbarProductLinks };
