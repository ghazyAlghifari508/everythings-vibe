"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/icon";
import { StudioSidebar } from "@/features/studio/components/workspace/studio-sidebar";
import type { StudioHistoryItem } from "@/features/studio/types/studio";

export interface StudioMobileHistoryDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	history: StudioHistoryItem[];
	onSelectProject: (id: string) => void;
	onDeleteProject: (id: string) => Promise<void>;
}

export function StudioMobileHistoryDrawer({
	open,
	onOpenChange,
	history,
	onSelectProject,
	onDeleteProject,
}: StudioMobileHistoryDrawerProps) {
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs transition-opacity data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
				<DialogPrimitive.Content
					className="fixed inset-y-0 left-0 z-50 flex h-full w-80 max-w-[85vw] flex-col border-r border-graphite bg-charcoal text-snow shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left md:hidden"
					aria-describedby="mobile-drawer-desc"
				>
					<DialogPrimitive.Title className="sr-only">
						Riwayat Project Studio
					</DialogPrimitive.Title>
					<DialogPrimitive.Description
						id="mobile-drawer-desc"
						className="sr-only"
					>
						Daftar project studio kamu yang tersimpan
					</DialogPrimitive.Description>
					<div className="flex items-center justify-between border-b border-graphite bg-charcoal px-4 py-3">
						<span className="text-xs font-semibold uppercase tracking-wider text-snow">
							My Projects
						</span>
						<DialogPrimitive.Close
							aria-label="Tutup riwayat"
							className="rounded-md p-1 text-fog hover:text-snow"
						>
							<Icon icon={Cancel01Icon} size={16} aria-hidden />
						</DialogPrimitive.Close>
					</div>
					<div className="flex-1 overflow-hidden">
						<StudioSidebar
							history={history}
							onSelectProject={onSelectProject}
							onDeleteProject={onDeleteProject}
							className="h-full w-full rounded-none border-0"
						/>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
