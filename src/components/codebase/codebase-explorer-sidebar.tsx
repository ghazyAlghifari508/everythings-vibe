"use client";

import {
	ChevronDown,
	ChevronRight,
	FileCode,
	Folder,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface ExplorerFileEntry {
	path: string;
	summary?: string;
}

interface CodebaseExplorerSidebarProps {
	codebaseName: string;
	branch?: string;
	fileCount?: number;
	syncLabel?: string;
	files: ExplorerFileEntry[];
	stack: string[];
	onSelectFile?: (path: string) => void;
}

export function filterExplorerFiles(
	files: ExplorerFileEntry[],
	query: string,
): ExplorerFileEntry[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return files;
	return files.filter((file) => file.path.toLowerCase().includes(normalized));
}

export interface TreeNode {
	name: string;
	fullPath: string;
	isFile: boolean;
	summary?: string;
	children: TreeNode[];
}

const canonicalCollator = new Intl.Collator("en", {
	numeric: true,
	sensitivity: "base",
});

export function compareExplorerTreeNodes(a: TreeNode, b: TreeNode): number {
	if (a.isFile !== b.isFile) {
		return a.isFile ? 1 : -1;
	}
	const primary = canonicalCollator.compare(a.name, b.name);
	if (primary !== 0) return primary;
	if (a.name < b.name) return -1;
	if (a.name > b.name) return 1;
	return a.fullPath.localeCompare(b.fullPath, "en");
}

export function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
	return [...nodes].sort(compareExplorerTreeNodes).map((node) => ({
		...node,
		children: node.children.length > 0 ? sortTreeNodes(node.children) : [],
	}));
}

export function buildTree(files: ExplorerFileEntry[]): TreeNode[] {
	const roots: TreeNode[] = [];
	const dirMap = new Map<string, TreeNode>();
	const ensureDir = (segments: string[]): TreeNode | null => {
		let parent: TreeNode | null = null;
		let acc = "";
		for (const segment of segments) {
			acc = acc ? `${acc}/${segment}` : segment;
			let node = dirMap.get(acc);
			if (!node) {
				node = {
					name: segment,
					fullPath: acc,
					isFile: false,
					children: [],
				};
				dirMap.set(acc, node);
				if (parent) parent.children.push(node);
				else roots.push(node);
			}
			parent = node;
		}
		return parent;
	};
	for (const file of files) {
		const segments = file.path.split("/").filter(Boolean);
		if (segments.length === 0) continue;
		if (segments.length === 1) {
			roots.push({
				name: segments[0],
				fullPath: segments[0],
				isFile: true,
				summary: file.summary,
				children: [],
			});
			continue;
		}
		const parent = ensureDir(segments.slice(0, -1));
		const leaf = segments[segments.length - 1];
		const node: TreeNode = {
			name: leaf,
			fullPath: file.path,
			isFile: true,
			summary: file.summary,
			children: [],
		};
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	return sortTreeNodes(roots);
}

function TreeRow({
	node,
	depth,
	onSelectFile,
}: {
	node: TreeNode;
	depth: number;
	onSelectFile?: (path: string) => void;
}) {
	const [expanded, setExpanded] = useState(depth < 2);
	if (!node.isFile && node.children.length > 0) {
		return (
			<div>
				<button
					type="button"
					onClick={() => setExpanded((current) => !current)}
					aria-expanded={expanded}
					className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2 text-left font-mono text-[12px] text-mist hover:bg-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					style={{ paddingLeft: `${8 + depth * 12}px` }}
				>
					{expanded ? (
						<ChevronDown
							size={13}
							aria-hidden="true"
							className="shrink-0 text-slate"
						/>
					) : (
						<ChevronRight
							size={13}
							aria-hidden="true"
							className="shrink-0 text-slate"
						/>
					)}
					<Folder
						size={13}
						aria-hidden="true"
						className="shrink-0 text-slate"
					/>
					<span className="truncate">{node.name}</span>
				</button>
				{expanded ? (
					<div>
						{node.children.map((child) => (
							<TreeRow
								key={child.fullPath}
								node={child}
								depth={depth + 1}
								onSelectFile={onSelectFile}
							/>
						))}
					</div>
				) : null}
			</div>
		);
	}
	return (
		<button
			type="button"
			onClick={() => {
				if (node.isFile) onSelectFile?.(node.fullPath);
			}}
			title={node.summary ?? node.fullPath}
			className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-2 text-left font-mono text-[12px] text-mist hover:bg-obsidian focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			style={{ paddingLeft: `${8 + depth * 12}px` }}
		>
			<span className="w-[13px] shrink-0" aria-hidden="true" />
			{node.isFile ? (
				<FileCode
					size={13}
					aria-hidden="true"
					className="shrink-0 text-slate"
				/>
			) : (
				<Folder size={13} aria-hidden="true" className="shrink-0 text-slate" />
			)}
			<span className="truncate">{node.name}</span>
		</button>
	);
}

export function CodebaseExplorerSidebar({
	codebaseName,
	branch = "main",
	fileCount,
	syncLabel = "Synced",
	files,
	stack,
	onSelectFile,
}: CodebaseExplorerSidebarProps) {
	const [query, setQuery] = useState("");
	const filtered = useMemo(
		() => filterExplorerFiles(files, query),
		[files, query],
	);
	const tree = useMemo(() => buildTree(filtered), [filtered]);

	return (
		<div
			data-testid="codebase-explorer-sidebar"
			className="flex h-full min-h-0 flex-col bg-charcoal"
		>
			<div className="shrink-0 border-b border-graphite p-3">
				<div className="rounded-lg border border-graphite bg-obsidian p-3">
					<div className="flex items-center justify-between gap-2">
						<p
							data-testid="codebase-explorer-name"
							className="truncate font-mono text-[13px] font-semibold text-snow"
							title={codebaseName}
						>
							{codebaseName}
						</p>
						<span className="shrink-0 rounded border border-emerald/30 bg-emerald/10 px-1.5 py-px text-[10px] font-semibold text-emerald">
							{syncLabel}
						</span>
					</div>
					<p className="mt-1 font-mono text-[11px] text-fog">
						Branch: {branch}
						{typeof fileCount === "number" ? ` • ${fileCount} file` : ""}
					</p>
				</div>
				<div className="relative mt-2">
					<Search
						size={14}
						aria-hidden="true"
						className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate"
					/>
					<label htmlFor="codebase-file-search" className="sr-only">
						Cari file dalam repository
					</label>
					<input
						id="codebase-file-search"
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Cari file dalam repository..."
						className="w-full rounded-lg border border-graphite bg-obsidian py-2 pl-8 pr-2 text-xs text-snow outline-none placeholder:text-slate focus-visible:ring-2 focus-visible:ring-indigo"
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				<p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate">
					Struktur direktori codebase
				</p>
				{tree.length === 0 ? (
					<p
						data-testid="codebase-explorer-empty"
						className="px-2 py-3 text-xs text-fog"
					>
						{query.trim()
							? "Tidak ada file yang cocok dengan pencarian."
							: "Belum ada file terindeks dari snapshot."}
					</p>
				) : (
					<div
						data-testid="codebase-explorer-tree"
						className="flex flex-col gap-px"
					>
						{tree.map((node) => (
							<TreeRow
								key={node.fullPath}
								node={node}
								depth={0}
								onSelectFile={onSelectFile}
							/>
						))}
					</div>
				)}
			</div>
			<div className="shrink-0 border-t border-graphite p-3">
				<p className="text-[10px] font-semibold uppercase tracking-wider text-slate">
					Stack codebase terdeteksi
				</p>
				{stack.length === 0 ? (
					<p className="mt-1.5 text-[11px] italic text-slate">
						Tidak terdeteksi
					</p>
				) : (
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{stack.map((item) => (
							<span
								key={item}
								className="rounded border border-graphite bg-obsidian px-2 py-0.5 font-mono text-[11px] text-mist"
							>
								{item}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
