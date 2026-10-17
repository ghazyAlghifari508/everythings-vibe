import { RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { formatCodebaseSyncBadge } from "../../utils/workspace-contracts";

export function WorkspaceHeader({
	name,
	isStarting,
	fileCount,
	onResync,
}: {
	name: string;
	isStarting: boolean;
	fileCount: number | null | undefined;
	onResync: () => void;
}) {
	return (
		<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-charcoal px-4">
			<div className="flex min-w-0 items-center gap-2">
				<Logo height={22} />
				<span aria-hidden="true" className="shrink-0 text-slate">
					/
				</span>
				<span className="flex min-w-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 py-1 font-mono text-xs text-mist">
					<span className="truncate">{name}</span>
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<button
					type="button"
					data-testid="codebase-resync-action"
					onClick={onResync}
					disabled={isStarting}
					className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2.5 font-mono text-[11px] text-fog transition hover:text-snow disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<RefreshCw size={12} aria-hidden />
					{isStarting ? "Menyiapkan..." : "Sync ulang"}
				</button>
				<span
					data-testid="codebase-sync-badge"
					className="shrink-0 rounded-md border border-graphite bg-obsidian px-2.5 py-1 font-mono text-[11px] text-fog"
				>
					{formatCodebaseSyncBadge(fileCount)}
				</span>
			</div>
		</header>
	);
}
