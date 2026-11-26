// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodebaseChatWorkspaceQuestions } from "../components/chat/codebase-chat-workspace-questions";
import type { AnswersPersistenceState } from "../hooks/use-workspace-handoff-persistence";
import type { AdaptiveQuestion } from "../services/chat-flow";

const questions: AdaptiveQuestion[] = [
	{
		id: "q1",
		title: "Apa arsitektur data?",
		type: "select",
		options: [
			{ id: "q1-opt1", label: "Database relasional", recommended: true },
			{ id: "q1-opt2", label: "Penyimpanan lokal" },
		],
		recommendedOptionId: "q1-opt1",
	},
	{
		id: "q2",
		title: "Permukaan mana yang ikut dicari?",
		type: "multiselect",
		options: [
			{ id: "q2-opt1", label: "Artikel" },
			{ id: "q2-opt2", label: "Produk" },
		],
	},
	{
		id: "q3",
		title: "Catatan tambahan?",
		type: "text",
		options: [],
	},
];

function radio(name: string | RegExp): HTMLInputElement {
	return screen.getByRole("radio", { name }) as HTMLInputElement;
}

function checkbox(name: string | RegExp): HTMLInputElement {
	return screen.getByRole("checkbox", { name }) as HTMLInputElement;
}

function button(name: RegExp): HTMLButtonElement {
	return screen.getByRole("button", { name }) as HTMLButtonElement;
}

interface HarnessProps {
	initialAnswers?: Record<string, string>;
	readOnly?: boolean;
	showFinalAction?: boolean;
	isConfirming?: boolean;
	persistence?: AnswersPersistenceState;
	onConfirmGenerate?: () => void;
}

/** Hosts the wizard the way the workspace does: an answer the card stores
 *  becomes a prop on the next render, which is what restores a step. */
function Harness({
	initialAnswers = {},
	readOnly = false,
	showFinalAction = true,
	isConfirming = false,
	persistence,
	onConfirmGenerate,
}: HarnessProps) {
	const [answers, setAnswers] = useState(initialAnswers);
	return (
		<CodebaseChatWorkspaceQuestions
			questions={questions}
			answers={answers}
			readOnly={readOnly}
			showFinalAction={showFinalAction}
			isConfirming={isConfirming}
			persistence={persistence}
			onConfirmGenerate={onConfirmGenerate}
			onSubmit={(questionId, answer) =>
				setAnswers((current) => ({ ...current, [questionId]: answer }))
			}
		/>
	);
}

function cardIds(): string[] {
	return screen
		.queryAllByTestId(/adaptive-question-/, { exact: false })
		.map((card) => card.getAttribute("data-testid") ?? "");
}

afterEach(cleanup);

describe("P04 — adaptive question wizard", () => {
	it("reveals one card at a time and opens on the first unanswered question", () => {
		render(<Harness initialAnswers={{ q1: "Database relasional" }} />);

		// Only one card exists: an answered question is never repeated as a second
		// card or a summary block beside the active one.
		expect(cardIds()).toEqual(["adaptive-question-q2"]);
		expect(screen.getByText("2 dari 3")).toBeDefined();
	});

	it("stores the answer on Berikutnya and restores it when stepping back", () => {
		render(<Harness />);

		expect(cardIds()).toEqual(["adaptive-question-q1"]);
		expect(button(/Berikutnya/).disabled).toBe(true);

		act(() => {
			fireEvent.click(radio(/Database relasional/));
		});
		expect(button(/Berikutnya/).disabled).toBe(false);

		act(() => {
			fireEvent.click(button(/Berikutnya/));
		});
		expect(cardIds()).toEqual(["adaptive-question-q2"]);

		act(() => {
			fireEvent.click(button(/Sebelumnya/));
		});
		expect(cardIds()).toEqual(["adaptive-question-q1"]);
		// The stored answer is back on its own option, not lost by the round trip.
		expect(radio(/Database relasional/).checked).toBe(true);
	});

	it("keeps an answer edited on an earlier step after walking forward again", () => {
		render(
			<Harness initialAnswers={{ q1: "Database relasional", q2: "Artikel" }} />,
		);

		// Opens on the last unanswered question.
		expect(cardIds()).toEqual(["adaptive-question-q3"]);

		act(() => {
			fireEvent.click(button(/Sebelumnya/));
		});
		expect(cardIds()).toEqual(["adaptive-question-q2"]);

		act(() => {
			fireEvent.click(button(/Sebelumnya/));
		});
		expect(cardIds()).toEqual(["adaptive-question-q1"]);
		// The stored answer is restored on the step it belongs to.
		expect(radio(/Database relasional/).checked).toBe(true);

		act(() => {
			fireEvent.click(radio(/Penyimpanan lokal/));
			fireEvent.click(button(/Berikutnya/));
		});

		act(() => {
			fireEvent.click(button(/Sebelumnya/));
		});
		expect(radio(/Penyimpanan lokal/).checked).toBe(true);
		expect(radio(/Database relasional/).checked).toBe(false);
	});

	it("gates every step on a valid answer", () => {
		render(<Harness />);

		// Nothing chosen yet: the step cannot move on.
		expect(button(/Berikutnya/).disabled).toBe(true);
		act(() => {
			fireEvent.click(button(/Berikutnya/));
		});
		expect(cardIds()).toEqual(["adaptive-question-q1"]);

		// Multi-select needs one checked option, and Lainnya needs its text.
		act(() => {
			fireEvent.click(radio(/Database relasional/));
			fireEvent.click(button(/Berikutnya/));
		});
		expect(button(/Berikutnya/).disabled).toBe(true);

		act(() => {
			fireEvent.click(checkbox(/Lainnya/));
		});
		expect(button(/Berikutnya/).disabled).toBe(true);

		act(() => {
			fireEvent.change(screen.getByLabelText("Jawaban lain"), {
				target: { value: "Galeri" },
			});
		});
		expect(button(/Berikutnya/).disabled).toBe(false);
		expect(screen.getByTestId("adaptive-question-q2")).toBeDefined();
	});

	it("turns the last step into the specification action and generates from stored answers", () => {
		const onConfirmGenerate = vi.fn();
		render(
			<Harness
				initialAnswers={{ q1: "Database relasional", q2: "Artikel" }}
				onConfirmGenerate={onConfirmGenerate}
			/>,
		);

		expect(cardIds()).toEqual(["adaptive-question-q3"]);
		const cta = screen.getByTestId("codebase-questions-complete");
		// The final action is the card's own forward control; nothing is stacked
		// below the wizard as a second, disconnected CTA.
		expect(cta.textContent).toBe("Buat Spesifikasi Fitur");
		expect(cta.parentElement?.textContent).toContain("Sebelumnya");
		// No answer typed yet, so the action stays closed.
		expect((cta as HTMLButtonElement).disabled).toBe(true);

		act(() => {
			fireEvent.change(screen.getByPlaceholderText("Tulis jawabanmu..."), {
				target: { value: "Tanpa catatan tambahan" },
			});
		});
		expect((cta as HTMLButtonElement).disabled).toBe(false);

		act(() => {
			fireEvent.click(cta);
		});
		// Generated only once the answer the action stored is part of the answers
		// the confirm reads.
		expect(onConfirmGenerate).toHaveBeenCalledTimes(1);
	});

	it("keeps the final action closed while its own question is unanswered", () => {
		const onConfirmGenerate = vi.fn();
		render(
			<Harness
				initialAnswers={{ q1: "Database relasional" }}
				onConfirmGenerate={onConfirmGenerate}
			/>,
		);

		// Step 2 of 3 is not the last one: it offers Berikutnya, not the CTA.
		expect(screen.queryByTestId("codebase-questions-complete")).toBeNull();
		act(() => {
			fireEvent.click(button(/Berikutnya/));
		});
		// Still on its own step, because no valid answer exists yet.
		expect(cardIds()).toEqual(["adaptive-question-q2"]);
		expect(onConfirmGenerate).not.toHaveBeenCalled();
	});

	it("reports a running generation through the real busy label", () => {
		render(
			<Harness
				initialAnswers={{
					q1: "Database relasional",
					q2: "Artikel",
					q3: "Selesai",
				}}
				isConfirming
			/>,
		);

		const cta = button(/Menyusun spesifikasi/);
		expect(cta.disabled).toBe(true);
		expect(
			screen.queryByRole("button", { name: /Buat Spesifikasi Fitur/ }),
		).toBeNull();
	});

	it("blocks the way forward on a failed save and retries it from the row", () => {
		const onRetry = vi.fn();
		const { rerender } = render(
			<Harness
				persistence={{
					status: "error",
					error: "Jawaban gagal disimpan. Coba lagi.",
					onRetry,
				}}
			/>,
		);

		act(() => {
			fireEvent.click(radio(/Database relasional/));
		});
		// A failed save owns the way forward: moving on would lose the answer.
		expect(button(/Berikutnya/).disabled).toBe(true);

		const row = screen.getByTestId("codebase-answers-save-error");
		expect(row.textContent).toContain("Jawaban gagal disimpan");
		act(() => {
			fireEvent.click(button(/Coba simpan ulang/));
		});
		expect(onRetry).toHaveBeenCalledTimes(1);

		rerender(
			<Harness persistence={{ status: "saved", error: null, onRetry }} />,
		);
		act(() => {
			fireEvent.click(radio(/Database relasional/));
		});
		expect(button(/Berikutnya/).disabled).toBe(false);
		expect(screen.queryByTestId("codebase-answers-save-error")).toBeNull();
	});

	it("reviews stored answers read-only once the plan exists: no edits, no generation", () => {
		const onConfirmGenerate = vi.fn();
		render(
			<Harness
				initialAnswers={{
					q1: "Database relasional",
					q2: "Artikel",
					q3: "Selesai",
				}}
				readOnly
				onConfirmGenerate={onConfirmGenerate}
			/>,
		);

		// Opens where the wizard left off: the last stored question.
		expect(cardIds()).toEqual(["adaptive-question-q3"]);
		const input = screen.getByDisplayValue("Selesai") as HTMLInputElement;
		expect(input.disabled).toBe(true);
		expect(screen.queryByTestId("codebase-questions-complete")).toBeNull();
		expect(onConfirmGenerate).not.toHaveBeenCalled();

		// Reviewing still walks the questions, without storing anything.
		act(() => {
			fireEvent.click(button(/Sebelumnya/));
		});
		expect(cardIds()).toEqual(["adaptive-question-q2"]);
		expect(checkbox(/Artikel/).disabled).toBe(true);
		expect(checkbox(/Artikel/).checked).toBe(true);
	});

	it("reopens the wizard on the stored answers with the final action offered", () => {
		render(
			<Harness
				initialAnswers={{
					q1: "Database relasional",
					q2: "Artikel",
					q3: "Selesai",
				}}
			/>,
		);

		expect(cardIds()).toEqual(["adaptive-question-q3"]);
		expect(screen.getByTestId("codebase-questions-complete")).toBeDefined();
	});

	it("exposes the question as the group's label with one tab stop and real progress", () => {
		render(<Harness />);

		const group = screen.getByRole("radiogroup");
		expect(
			document.getElementById(group.getAttribute("aria-labelledby") ?? "")
				?.textContent,
		).toBe(questions[0].title);

		const controls = screen.getAllByRole("radio") as HTMLInputElement[];
		expect(controls.every((control) => control.type === "radio")).toBe(true);
		expect(new Set(controls.map((control) => control.name)).size).toBe(1);

		// Keyboard users Tab to the group, then move inside it: exactly one control
		// holds the tab stop, and the chosen one keeps it.
		act(() => {
			fireEvent.click(controls[1]);
		});
		expect(controls[1].checked).toBe(true);
		const tabbable = controls.filter(
			(control) => control.getAttribute("tabindex") === "0",
		);
		expect(tabbable).toEqual([controls[1]]);

		const bar = screen.getByRole("progressbar");
		expect(bar.getAttribute("aria-valuetext")).toBe("Pertanyaan 1 dari 3");
		expect(bar.getAttribute("aria-valuenow")).toBe("1");
	});
});
