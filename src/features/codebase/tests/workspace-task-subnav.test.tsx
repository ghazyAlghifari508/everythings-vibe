// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { WorkspaceTaskSubnav } from "../components/workspace/workspace-task-subnav";

afterEach(cleanup);

function Preview() {
	const [view, setView] = useState<"kanban" | "checklist">("kanban");
	return (
		<WorkspaceTaskSubnav canvasView={view} setCanvasView={setView}>
			{view === "kanban" ? "Board content" : "Checklist content"}
		</WorkspaceTaskSubnav>
	);
}

it("changes the visible task panel by pointer and keyboard without losing the selected state", () => {
	render(<Preview />);
	const kanban = screen.getByRole("tab", { name: "Kanban" });
	const checklist = screen.getByRole("tab", { name: "Checklist" });
	expect(screen.getByRole("tabpanel").textContent).toBe("Board content");
	fireEvent.click(checklist);
	expect(screen.getByRole("tabpanel").textContent).toBe("Checklist content");
	expect(checklist.getAttribute("aria-selected")).toBe("true");
	fireEvent.keyDown(checklist, { key: "ArrowLeft" });
	fireEvent.keyUp(kanban, { key: "ArrowLeft" });
	expect(screen.getByRole("tabpanel").textContent).toBe("Board content");
	expect(kanban.getAttribute("aria-selected")).toBe("true");
});
