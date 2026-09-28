"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface TableOfContentsProps {
	content: string;
	className?: string;
	/** Deepest heading level to list (2=only ## sections). Default 4 (##/###/####). */
	maxLevel?: number;
}

interface TocItem {
	level: number;
	text: string;
	id: string;
}

export function TableOfContents({
	content,
	className,
	maxLevel = 4,
}: TableOfContentsProps) {
	const [collapsed, setCollapsed] = useState(false);

	const tocItems = useMemo(() => {
		const items: TocItem[] = [];
		const lines = content.split("\n");
		for (const line of lines) {
			const match = line.match(/^(#{2,4})\s+(.+)/);
			if (match) {
				const level = match[1].length;
				if (level > maxLevel) continue;
				const text = match[2].trim();
				items.push({
					level,
					text,
					id: text.toLowerCase().replace(/[^\w]+/g, "-"),
				});
			}
		}
		return items;
	}, [content, maxLevel]);

	if (tocItems.length === 0) return null;

	return (
		<div className={cn("space-y-1", className)}>
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className="mb-2 flex w-full items-center justify-between text-sm font-medium text-(--text-secondary) hover:text-(--text-primary) dark:hover:text-[#F0F0F0]"
			>
				<span>Table of Contents</span>
				<svg
					aria-hidden="true"
					className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
					fill="none"
					viewBox="0 0 16 16"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M6 4l4 4-4 4"
					/>
				</svg>
			</button>

			{!collapsed && (
				<nav className="space-y-0.5">
					{tocItems.map((item) => (
						<a
							key={item.id}
							href={`#${item.id}`}
							className={cn(
								"block rounded px-2 py-1 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 break-words",
								item.level === 2 && "font-medium text-(--text-primary)",
								item.level === 3 &&
									"ml-3 text-(--text-secondary) hover:text-(--text-primary) dark:hover:text-[#F0F0F0]",
								item.level === 4 &&
									"ml-6 text-xs text-(--text-secondary)/70 hover:text-(--text-primary) dark:hover:text-[#F0F0F0]",
							)}
							onClick={(e) => {
								e.preventDefault();
								const el = document.getElementById(item.id);
								if (el)
									el.scrollIntoView({ behavior: "smooth", block: "start" });
							}}
						>
							{item.text}
						</a>
					))}
				</nav>
			)}
		</div>
	);
}
