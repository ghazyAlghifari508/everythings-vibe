"use client";

import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// Prevent hydration mismatch
	useEffect(() => setMounted(true), []);

	if (!mounted) {
		return <div className="h-8 w-8 animate-pulse rounded-md bg-white/5" />;
	}

	const isDark = resolvedTheme === "dark";
	const actionLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

	return (
		<button
			type="button"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className="flex h-8 w-8 items-center justify-center rounded-md text-fog transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fog/40"
			aria-label={actionLabel}
			title={actionLabel}
		>
			{isDark ? (
				<Icon icon={Sun01Icon} size={16} />
			) : (
				<Icon icon={Moon02Icon} size={16} />
			)}
		</button>
	);
}
