import { Tabs } from "@heroui/react";
import { CheckListIcon, KanbanIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function WorkspaceTaskSubnav({
	canvasView,
	setCanvasView,
	children,
}: {
	canvasView: "kanban" | "checklist";
	setCanvasView: (view: "kanban" | "checklist") => void;
	children: ReactNode;
}) {
	return (
		<Tabs
			selectedKey={canvasView}
			onSelectionChange={(key) => {
				if (key === "kanban" || key === "checklist") setCanvasView(key);
			}}
			className="flex h-full min-h-0 flex-col"
		>
			<Tabs.List
				aria-label="Mode tampilan task"
				className="flex shrink-0 gap-1 border-b border-graphite px-3 py-2"
			>
				<Tabs.Tab
					id="kanban"
					className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-fog outline-none data-[selected=true]:bg-steel/40 data-[selected=true]:text-snow data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-indigo"
				>
					<Icon icon={KanbanIcon} size={18} />
					Kanban
				</Tabs.Tab>
				<Tabs.Tab
					id="checklist"
					className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-fog outline-none data-[selected=true]:bg-steel/40 data-[selected=true]:text-snow data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-indigo"
				>
					<Icon icon={CheckListIcon} size={18} />
					Checklist
				</Tabs.Tab>
			</Tabs.List>
			<Tabs.Panel
				id="kanban"
				className="min-h-0 flex-1 outline-none data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-indigo"
			>
				{canvasView === "kanban" ? children : null}
			</Tabs.Panel>
			<Tabs.Panel
				id="checklist"
				className="min-h-0 flex-1 outline-none data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-indigo"
			>
				{canvasView === "checklist" ? children : null}
			</Tabs.Panel>
		</Tabs>
	);
}
