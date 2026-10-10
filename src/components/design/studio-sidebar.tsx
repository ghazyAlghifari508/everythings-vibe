"use client";

import {
	FileText,
	ImageIcon,
	Monitor,
	Search,
	Smartphone,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface StudioHistoryItem {
	id: string;
	title: string;
	designMode?: string;
	hasDesignMd?: boolean;
	hasLogo?: boolean;
	createdAt: string;
}

export interface StudioSidebarProps {
	history: StudioHistoryItem[];
	onSelectProject: (id: string) => void;
	className?: string;
}

export function StudioSidebar({
	history,
	onSelectProject,
	className = "",
}: StudioSidebarProps) {
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const trimmed = query.trim().toLowerCase();
		if (!trimmed) return history;
		return history.filter((item) => item.title.toLowerCase().includes(trimmed));
	}, [history, query]);

	return (
		<aside
			aria-label="Riwayat Project Studio"
			className={`flex flex-col border-r border-graphite bg-charcoal ${className}`}
		>
			{/* Sidebar Header */}
			<div className="flex shrink-0 items-center justify-between border-b border-graphite px-4 py-3.5">
				<div className="flex items-center gap-2">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-snow">
						My Projects
					</h2>
					<span className="rounded-full bg-onyx border border-graphite px-2 py-0.5 font-mono text-[10px] text-fog">
						{history.length}
					</span>
				</div>
			</div>

			{/* Search Input */}
			<div className="shrink-0 p-3 border-b border-graphite/60">
				<div className="relative flex items-center">
					<Search
						size={14}
						className="absolute left-2.5 text-fog pointer-events-none"
						aria-hidden
					/>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari project..."
						aria-label="Cari project studio"
						className="w-full rounded-lg border border-graphite bg-onyx py-1.5 pl-8 pr-7 text-xs text-snow placeholder:text-fog focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
					/>
					{query ? (
						<button
							type="button"
							onClick={() => setQuery("")}
							aria-label="Hapus pencarian"
							className="absolute right-2 text-fog hover:text-snow"
						>
							<X size={13} aria-hidden />
						</button>
					) : null}
				</div>
			</div>

			{/* Project List */}
			<div className="flex-1 overflow-y-auto p-2">
				{history.length === 0 ? (
					<div className="flex flex-col items-center justify-center p-6 text-center">
						<p className="text-xs font-semibold text-mist">
							Belum ada project studio.
						</p>
						<p className="mt-1 text-[11px] text-fog">
							Tulis deskripsi antarmuka di samping untuk memulai.
						</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="p-4 text-center">
						<p className="text-xs text-fog">
							Tidak ada project yang cocok dengan &quot;
							<span className="text-snow">{query}</span>&quot;.
						</p>
					</div>
				) : (
					<ul className="space-y-1">
						{filtered.map((item) => {
							const isMobile = item.designMode === "mobile";
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => onSelectProject(item.id)}
										className="group flex w-full flex-col gap-1.5 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-graphite hover:bg-onyx focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
									>
										<div className="flex items-start justify-between gap-2">
											<span className="line-clamp-2 text-xs font-semibold text-snow group-hover:text-white">
												{item.title}
											</span>
											<span
												className="shrink-0 text-fog group-hover:text-mist mt-0.5"
												title={isMobile ? "Mobile Design" : "Web Design"}
											>
												{isMobile ? (
													<Smartphone size={13} aria-hidden />
												) : (
													<Monitor size={13} aria-hidden />
												)}
											</span>
										</div>

										<div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-fog">
											<span>
												{new Date(item.createdAt).toLocaleDateString("id-ID", {
													day: "numeric",
													month: "short",
												})}
											</span>
											<span>·</span>
											<span className="uppercase tracking-wider">
												{isMobile ? "Mobile" : "Web"}
											</span>
											{item.hasDesignMd && (
												<span
													className="inline-flex items-center gap-0.5 rounded bg-charcoal px-1 py-0.5 text-mist border border-graphite/80"
													title="Menggunakan DESIGN.md"
												>
													<FileText size={10} aria-hidden />
													<span>Ref</span>
												</span>
											)}
											{item.hasLogo && (
												<span
													className="inline-flex items-center gap-0.5 rounded bg-charcoal px-1 py-0.5 text-mist border border-graphite/80"
													title="Menggunakan Logo"
												>
													<ImageIcon size={10} aria-hidden />
													<span>Logo</span>
												</span>
											)}
										</div>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</aside>
	);
}
