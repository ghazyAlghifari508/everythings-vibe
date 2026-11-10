// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";

const question = {
	id: "q1",
	title: "Storage?",
	type: "text" as const,
	options: [],
};
const base = {
	featureName: "Example",
	messages: [],
	questions: [question],
	answers: { q1: "Local" },
};
afterEach(cleanup);

it("keeps clarification editable until the persisted feature arrives", () => {
	const { rerender } = render(<CodebaseChatWorkspace {...base} />);

	// While the stage is still clarification the stored answer is editable and the
	// wizard offers the specification action on its last (here: only) question.
	const editable = screen.getByDisplayValue("Local") as HTMLInputElement;
	expect(editable.disabled).toBe(false);
	expect(
		screen.getByRole("button", { name: /Buat Spesifikasi Fitur/ }),
	).toBeTruthy();

	rerender(
		<CodebaseChatWorkspace
			{...base}
			stage="feature"
			artifacts={[
				{
					id: "feature-p",
					fileName: "feature.json",
					fileSizeBytes: null,
					badge: "FITUR",
					description: "Specification",
				},
			]}
		/>,
	);

	// Read-only review of the very same answers: no edits, and nothing silently
	// generates a second plan.
	expect((screen.getByDisplayValue("Local") as HTMLInputElement).disabled).toBe(
		true,
	);
	expect(screen.getByDisplayValue("Local")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: /Buat Spesifikasi Fitur/ }),
	).toBeNull();
});

it("reopens a persisted plan without offering answer edits", () => {
	render(
		<CodebaseChatWorkspace {...base} stage="handoff" projectIdForHandoff="p" />,
	);
	expect((screen.getByDisplayValue("Local") as HTMLInputElement).disabled).toBe(
		true,
	);
	expect(
		screen.queryByRole("button", { name: /Buat Spesifikasi Fitur/ }),
	).toBeNull();
});

it("removes the composer at persisted Task completion even when no task is done", () => {
	render(
		<CodebaseChatWorkspace
			{...base}
			stage="handoff"
			projectIdForHandoff="p"
			kanbanProgress={{ done: 0, total: 30, pct: 0 }}
		/>,
	);
	expect(screen.queryByRole("textbox", { name: /Jelaskan/ })).toBeNull();
	expect(screen.queryByText(/Fitur aktif:/)).toBeNull();
	expect(
		screen.getByRole("button", { name: "Salin instruksi untuk agent" }),
	).toBeTruthy();
});

it("does not flash an active composer while Task hydration is unresolved", () => {
	render(<CodebaseChatWorkspace {...base} stage="feature" tasksUnresolved />);
	expect(screen.queryByRole("textbox", { name: /Jelaskan/ })).toBeNull();
});

it("keeps the Task retry and composer available after failure before persistence", () => {
	const retry = vi.fn();
	render(
		<CodebaseChatWorkspace
			{...base}
			stage="ac"
			stageError="Task failed"
			onRetryStage={retry}
			onGenerateTask={retry}
		/>,
	);
	expect(screen.getByRole("textbox", { name: /Jelaskan/ })).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
	expect(retry).toHaveBeenCalledOnce();
});

it("opens the persisted Task artifact as Kanban without enabling regeneration", () => {
	const open = vi.fn();
	const generate = vi.fn();
	const task = {
		id: "tasks-p",
		fileName: "tasks.json",
		fileSizeBytes: null,
		badge: "TASK",
		description: "Tasks",
	};
	render(
		<CodebaseChatWorkspace
			{...base}
			stage="handoff"
			projectIdForHandoff="p"
			artifacts={[task]}
			onOpenArtifact={open}
			onGenerateTask={generate}
			onGeneratePrd={generate}
			onGenerateAc={generate}
		/>,
	);
	fireEvent.click(
		screen.getByRole("button", {
			name: /Buka preview tasks\.json|Buka Kanban/,
		}),
	);
	expect(open).toHaveBeenCalledWith(task);
	expect(
		screen.queryByRole("button", { name: /Buat (Task|PRD|AC)/ }),
	).toBeNull();
	expect(generate).not.toHaveBeenCalled();
});

it("keeps a new feature composer active", () => {
	render(
		<CodebaseChatWorkspace
			{...base}
			questions={[]}
			answers={{}}
			isCreatingNew
		/>,
	);
	expect(
		screen.getByRole("textbox", { name: /Jelaskan fitur baru/ }),
	).toBeTruthy();
});
