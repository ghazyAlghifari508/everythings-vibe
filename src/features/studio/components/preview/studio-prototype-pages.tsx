import { Drawer, ScrollShadow } from "@heroui/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { StudioPrototypeScreen } from "@/features/studio/types/studio-prototype";

interface PageListProps {
	screens: readonly StudioPrototypeScreen[];
	currentId: string | null;
	onSelect: (screenId: string) => void;
}

function PageList({ screens, currentId, onSelect }: PageListProps) {
	if (screens.length === 0)
		return (
			<p className="px-4 py-6 text-sm text-fog">
				Belum ada halaman yang selesai dibuat.
			</p>
		);
	return (
		<ul className="flex flex-col gap-1 p-2">
			{screens.map((screen) => {
				const current = screen.id === currentId;
				return (
					<li key={screen.id}>
						<button
							type="button"
							aria-current={current ? "page" : undefined}
							onClick={() => onSelect(screen.id)}
							className={`flex min-h-11 w-full flex-col justify-center rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow ${
								current
									? "border-snow/40 bg-steel text-snow"
									: "border-transparent text-fog hover:bg-graphite hover:text-snow"
							}`}
						>
							<span className="truncate text-sm font-[510]">{screen.name}</span>
							<span className="truncate font-berkeley-mono text-xs text-fog">
								{screen.route}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

/** Right-side page navigation on wide viewports. */
export function StudioPrototypeSidebar(props: PageListProps) {
	return (
		<aside
			aria-label="Halaman prototipe"
			className="hidden min-h-0 w-72 shrink-0 flex-col border-l border-graphite bg-obsidian lg:flex"
		>
			<div className="flex h-12 shrink-0 items-center justify-between border-b border-graphite px-4">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-fog">
					Halaman
				</h2>
				<span className="font-berkeley-mono text-xs text-fog">
					{props.screens.length}
				</span>
			</div>
			<ScrollShadow className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
				<PageList {...props} />
			</ScrollShadow>
		</aside>
	);
}

/** Compact page switcher for narrow viewports: the same list in a drawer. */
export function StudioPrototypeDrawer({
	open,
	onOpenChange,
	...list
}: PageListProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Drawer isOpen={open} onOpenChange={onOpenChange}>
			<Drawer.Backdrop>
				<Drawer.Content placement="right">
					<Drawer.Dialog className="flex h-full w-80 max-w-[85vw] flex-col border-l border-graphite bg-obsidian text-snow">
						<Drawer.Header className="flex h-12 shrink-0 items-center justify-between border-b border-graphite px-4">
							<Drawer.Heading className="text-xs font-semibold uppercase tracking-wider text-fog">
								Halaman ({list.screens.length})
							</Drawer.Heading>
							<Drawer.CloseTrigger
								aria-label="Tutup daftar halaman"
								className="flex size-11 items-center justify-center rounded-md text-fog hover:text-snow"
							>
								<Icon icon={Cancel01Icon} size={16} aria-hidden />
							</Drawer.CloseTrigger>
						</Drawer.Header>
						<Drawer.Body className="min-h-0 flex-1 overflow-y-auto p-0 custom-scrollbar">
							<PageList
								{...list}
								onSelect={(id) => {
									list.onSelect(id);
									onOpenChange(false);
								}}
							/>
						</Drawer.Body>
					</Drawer.Dialog>
				</Drawer.Content>
			</Drawer.Backdrop>
		</Drawer>
	);
}
