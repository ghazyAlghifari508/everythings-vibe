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

it("keeps clarification editable until the persisted feature arrives, including an open edit", () => {
	const { rerender } = render(<CodebaseChatWorkspace {...base} />);
	fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
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
	expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
	expect(screen.queryByRole("button", { name: /Simpan/ })).toBeNull();
	expect(screen.getByText("Jawaban: Local")).toBeTruthy();
});

it("reopens a persisted plan without offering answer edits", () => {
	render(
		<CodebaseChatWorkspace {...base} stage="handoff" projectIdForHandoff="p" />,
	);
	expect(screen.queryByRole("button", { name: "Ubah" })).toBeNull();
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
		screen.getByRole("button", { name: "Salin prompt handoff" }),
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
	fireEvent.click(screen.getByRole("button", { name: "Buka Kanban" }));
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
