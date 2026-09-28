"use client";

import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HistoryDrawer } from "./history-drawer";
import { Navbar } from "./navbar";
import { SubscriptionBanner } from "./subscription-banner";

export function AppLayout({ children }: { children: React.ReactNode }) {
	const pathname = useLocation({ select: (l) => l.pathname });
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);

	// Hide navbar on auth pages and PRD index page (has its own back button)
	// Show navbar everywhere except bare auth/minimal pages.
	// PRD/AC/Task/Kanban pages get the flow step navigation.
	const hideNavbarRoutes = [
		"/login",
		"/auth/callback",
		"/prd",
		"/onboarding",
		"/settings",
		"/admin",
	];
	const hideNavbar =
		hideNavbarRoutes.includes(pathname) ||
		pathname.startsWith("/settings/") ||
		pathname.startsWith("/admin/");

	// Lock body scroll on workspace pages (Ask, PRD, AC, Task, Kanban) and while
	// the history drawer overlays the page. Both writers must stay in this one
	// effect: two competing effects would each clear the lock on cleanup.
	const isWorkspace =
		pathname.startsWith("/ask/") ||
		(pathname.startsWith("/prd/") && !pathname.startsWith("/prd/share/")) ||
		pathname.startsWith("/ac/") ||
		pathname.startsWith("/task/") ||
		pathname.startsWith("/kanban/");

	const shouldLockScroll = isWorkspace || isDrawerOpen;

	useEffect(() => {
		if (shouldLockScroll) {
			document.body.style.overflow = "hidden";
			document.body.style.overscrollBehavior = "contain";
		} else {
			document.body.style.overflow = "";
			document.body.style.overscrollBehavior = "";
		}
		return () => {
			document.body.style.overflow = "";
			document.body.style.overscrollBehavior = "";
		};
	}, [shouldLockScroll]);

	// The drawer is opened from the navbar, which persists across navigation.
	// Without this it would stay open over the destination page. Comparing
	// against the previous path also skips the redundant reset on first mount.
	const previousPathname = useRef(pathname);
	useEffect(() => {
		if (previousPathname.current !== pathname) {
			previousPathname.current = pathname;
			setIsDrawerOpen(false);
		}
	}, [pathname]);

	return (
		<>
			{!hideNavbar && <Navbar onOpenDrawer={() => setIsDrawerOpen(true)} />}
			<div
				data-workspace-shell={isWorkspace ? "" : undefined}
				className={
					hideNavbar
						? "flex flex-col min-h-screen"
						: isWorkspace
							? // h-dvh, not h-screen: 100vh resolves to the LARGE mobile
								// viewport (browser chrome hidden), so a full-height shell
								// overflows the visible area. Body scroll is locked here, so
								// nothing could compensate and the bottom of the route — where
								// the Next button lives — sank out of reach. The dynamic unit
								// tracks the visible viewport instead.
								"pt-14 flex flex-col h-dvh overflow-hidden"
							: "pt-14 flex flex-col min-h-screen"
				}
			>
				{/* The shell is a fixed-height flex column that owns no scrolling.
				    Children (the banner, then the route) are the only scroll
				    consumers, so every direct child must be allowed to shrink
				    below its content height: without min-h-0 a flex item keeps
				    its intrinsic height, overflows the shell, and the bottom of
				    the route (the Next/Generate button) becomes unreachable
				    because body scroll is locked. */}
				{!hideNavbar && <SubscriptionBanner />}
				{children}
			</div>

			<HistoryDrawer
				isOpen={isDrawerOpen}
				onClose={() => setIsDrawerOpen(false)}
			/>
		</>
	);
}
