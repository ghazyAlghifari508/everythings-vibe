export function WorkspaceTaskSubnav({
	canvasView,
	setCanvasView,
}: {
	canvasView: "kanban" | "checklist";
	setCanvasView: (view: "kanban" | "checklist") => void;
}) {
	return (
		<fieldset
			aria-label="Mode tampilan task"
			className="flex rounded-md border border-graphite bg-obsidian p-0.5"
		>
			<legend className="sr-only">Mode tampilan task</legend>
			<button
				type="button"
				onClick={() => setCanvasView("kanban")}
				aria-pressed={canvasView === "kanban"}
				className={`min-h-8 rounded px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
					canvasView === "kanban"
						? "bg-steel/40 text-snow"
						: "text-fog hover:text-snow"
				}`}
			>
				Papan Kanban
			</button>
			<button
				type="button"
				onClick={() => setCanvasView("checklist")}
				aria-pressed={canvasView === "checklist"}
				className={`min-h-8 rounded px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
					canvasView === "checklist"
						? "bg-steel/40 text-snow"
						: "text-fog hover:text-snow"
				}`}
			>
				Checklist Tree
			</button>
		</fieldset>
	);
}
