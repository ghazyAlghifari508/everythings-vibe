import { File01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
				<span
					data-testid="codebase-workspace-repo-name"
					title={name}
					className="truncate text-xs font-medium text-snow"
				>
					{name}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="codebase-resync-action"
					onClick={onResync}
					disabled={isStarting}
					className="h-8 gap-1.5 border-graphite bg-obsidian px-2.5 font-mono text-[11px] text-fog hover:text-snow hover:bg-graphite/30 disabled:cursor-wait disabled:opacity-60"
				>
					<Icon icon={RefreshIcon} size={13} aria-hidden="true" />
					{isStarting ? "Menyiapkan..." : "Sync ulang"}
				</Button>
				<span
					data-testid="codebase-sync-badge"
					className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fog select-none"
				>
					<Icon
						icon={File01Icon}
						size={13}
						className="shrink-0 text-mist"
						aria-hidden="true"
					/>
					<span>{formatCodebaseSyncBadge(fileCount)}</span>
				</span>
			</div>
		</header>
	);
}
