"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// Prevent hydration mismatch
	useEffect(() => setMounted(true), []);

	if (!mounted) {
		return <div className="h-8 w-8 animate-pulse rounded-md bg-white/5" />;
	}

	const isDark = resolvedTheme === "dark";

	return (
		<button
			type="button"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className="flex h-8 w-8 items-center justify-center rounded-md text-fog transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/5 hover:text-snow"
			aria-label="Toggle dark mode"
			title={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? <Sun size={16} /> : <Moon size={16} />}
		</button>
	);
}
