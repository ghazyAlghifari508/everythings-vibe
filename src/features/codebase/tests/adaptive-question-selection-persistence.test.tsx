// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodebaseAdaptiveQuestion } from "../components/chat/codebase-adaptive-question";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import type { AdaptiveQuestion } from "../services/chat-flow";
import { settleRun, startRun } from "../services/chat-flow";

afterEach(() => {
	cleanup();
});

const SCOPES = [
	"Hanya judul",
	"Judul dan deskripsi",
	"Judul, deskripsi, dan tag",
];

/** Fresh object graph on every call: simulates a parent that re-derives data. */
function selectQuestion(): AdaptiveQuestion {
	return {
		id: "scope",
		title: "Bagaimana cakupan pencarian kata kunci?",
		type: "select",
		options: SCOPES.map((label, index) => ({
			id: `scope-opt${index + 1}`,
			label,
		})),
	};
}

function multiQuestion(): AdaptiveQuestion {
	return {
		id: "surfaces",
		title: "Permukaan mana yang ikut dicari?",
		type: "multiselect",
		options: ["Artikel", "Halaman", "Produk"].map((label, index) => ({
			id: `surfaces-opt${index + 1}`,
			label,
		})),
	};
}

function textQuestion(): AdaptiveQuestion {
	return {
		id: "notes",
		title: "Catatan tambahan?",
		type: "text",
		options: [],
	};
}

function renderQuestion(
	overrides: Partial<Parameters<typeof CodebaseAdaptiveQuestion>[0]> = {},
) {
	const onSubmit = vi.fn();
	const props = {
		question: selectQuestion(),
		index: 1,
		totalQuestions: 1,
		submitted: "",
		active: true,
		onSubmit,
		...overrides,
	};
	const view = render(<CodebaseAdaptiveQuestion {...props} />);
	return { ...view, onSubmit, props };
}

function radio(name: string): HTMLInputElement {
	return screen.getByRole("radio", { name }) as HTMLInputElement;
}

/** Radix popovers mark the rest of the tree aria-hidden; the DOM is intact. */
function radioIgnoringAriaHidden(name: string): HTMLInputElement {
	return screen.getByRole("radio", {
		name,
		hidden: true,
	}) as HTMLInputElement;
}

function checkbox(name: string): HTMLInputElement {
	return screen.getByRole("checkbox", { name }) as HTMLInputElement;
}

function confirmButton(): HTMLButtonElement {
	return screen.getByRole("button", {
		name: /Konfirmasi/,
	}) as HTMLButtonElement;
}

describe("FIX 05 — adaptive question selection never resets underneath the user", () => {
	it("1-4. keeps the chosen option across a parent rerender, including reallocated options", () => {
		const { rerender, props } = renderQuestion();

		fireEvent.click(radio("Judul dan deskripsi"));
		expect(radio("Judul dan deskripsi").checked).toBe(true);

		// Same logical data, identical object identity.
		rerender(<CodebaseAdaptiveQuestion {...props} />);
		expect(radio("Judul dan deskripsi").checked).toBe(true);

		// Newly allocated `question.options` with equivalent contents.
		rerender(
			<CodebaseAdaptiveQuestion {...props} question={selectQuestion()} />,
		);
		expect(radio("Judul dan deskripsi").checked).toBe(true);
		expect(radio("Hanya judul").checked).toBe(false);
	});

	it("5-6. enables Konfirmasi after a valid selection and submits once", () => {
		const { onSubmit } = renderQuestion();

		expect(confirmButton().disabled).toBe(true);

		fireEvent.click(radio("Judul, deskripsi, dan tag"));
		expect(confirmButton().disabled).toBe(false);
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.click(confirmButton());
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(onSubmit).toHaveBeenCalledWith("scope", "Judul, deskripsi, dan tag");
	});

	it("7-8. a question id change re-initializes from that question's answer", () => {
		const { rerender, props } = renderQuestion();

		fireEvent.click(radio("Hanya judul"));
		expect(radio("Hanya judul").checked).toBe(true);

		const other: AdaptiveQuestion = {
			id: "other",
			title: "Pertanyaan lain?",
			type: "select",
			options: [
				{ id: "other-opt1", label: "Ya" },
				{ id: "other-opt2", label: "Tidak" },
			],
		};

		rerender(
			<CodebaseAdaptiveQuestion
				{...props}
				question={other}
				submitted="Tidak"
				isEditing={true}
			/>,
		);
		expect(radio("Tidak").checked).toBe(true);
		expect(radio("Ya").checked).toBe(false);
	});

	it("9. single-select keeps exactly one choice", () => {
		renderQuestion();

		fireEvent.click(radio("Hanya judul"));
		fireEvent.click(radio("Judul, deskripsi, dan tag"));

		const checked = screen
			.getAllByRole("radio")
			.filter((input) => (input as HTMLInputElement).checked);
		expect(checked).toHaveLength(1);
		expect(radio("Judul, deskripsi, dan tag").checked).toBe(true);
	});

	it("10-11. multi-select keeps multiple choices across reallocated options", () => {
		const onSubmit = vi.fn();
		const props = {
			question: multiQuestion(),
			index: 1,
			totalQuestions: 1,
			submitted: "",
			active: true,
			onSubmit,
		};
		const { rerender } = render(<CodebaseAdaptiveQuestion {...props} />);

		fireEvent.click(checkbox("Artikel"));
		fireEvent.click(checkbox("Produk"));
		expect(checkbox("Artikel").checked).toBe(true);
		expect(checkbox("Produk").checked).toBe(true);

		rerender(
			<CodebaseAdaptiveQuestion {...props} question={multiQuestion()} />,
		);
		expect(checkbox("Artikel").checked).toBe(true);
		expect(checkbox("Produk").checked).toBe(true);

		fireEvent.click(confirmButton());
		expect(onSubmit).toHaveBeenCalledWith("surfaces", "Artikel, Produk");
	});

	it("12-13. custom answer keeps its selection and text, and requires text", () => {
		const { rerender, props } = renderQuestion();

		fireEvent.click(radio("Lainnya"));
		expect(confirmButton().disabled).toBe(true);

		const customInput = screen.getByRole("textbox") as HTMLInputElement;
		fireEvent.change(customInput, { target: { value: "Judul dan slug" } });
		expect(confirmButton().disabled).toBe(false);

		rerender(
			<CodebaseAdaptiveQuestion {...props} question={selectQuestion()} />,
		);
		expect(radio("Lainnya").checked).toBe(true);
		expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
			"Judul dan slug",
		);
		expect(confirmButton().disabled).toBe(false);
	});

	it("14-15. text question drafts persist across rerenders", () => {
		const onSubmit = vi.fn();
		const props = {
			question: textQuestion(),
			index: 1,
			totalQuestions: 1,
			submitted: "",
			active: true,
			onSubmit,
		};
		const { rerender } = render(<CodebaseAdaptiveQuestion {...props} />);

		const input = screen.getByRole("textbox") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "Pakai pencarian full-text" } });

		rerender(<CodebaseAdaptiveQuestion {...props} question={textQuestion()} />);
		expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
			"Pakai pencarian full-text",
		);

		fireEvent.click(confirmButton());
		expect(onSubmit).toHaveBeenCalledWith("notes", "Pakai pencarian full-text");
	});

	it("16-18. editing starts from the persisted answer; cancel restores it", () => {
		const onSubmit = vi.fn();
		const onCancelEdit = vi.fn();
		const { rerender } = render(
			<CodebaseAdaptiveQuestion
				question={selectQuestion()}
				index={1}
				totalQuestions={1}
				submitted="Judul dan deskripsi"
				active={true}
				isEditing={true}
				onSubmit={onSubmit}
				onCancelEdit={onCancelEdit}
			/>,
		);

		expect(radio("Judul dan deskripsi").checked).toBe(true);
		fireEvent.click(radio("Judul, deskripsi, dan tag"));
		expect(radio("Judul, deskripsi, dan tag").checked).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Batal" }));
		expect(onCancelEdit).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();

		rerender(
			<CodebaseAdaptiveQuestion
				question={selectQuestion()}
				index={1}
				totalQuestions={1}
				submitted="Judul dan deskripsi"
				active={true}
				isEditing={false}
				onSubmit={onSubmit}
				onCancelEdit={onCancelEdit}
			/>,
		);
		expect(screen.getByText(/Judul dan deskripsi/)).toBeTruthy();
	});

	it("19-20. repeated hydration of the same persisted answer keeps the draft", () => {
		const { rerender, props } = renderQuestion();

		fireEvent.click(radio("Judul, deskripsi, dan tag"));

		for (let attempt = 0; attempt < 3; attempt += 1) {
			rerender(
				<CodebaseAdaptiveQuestion
					{...props}
					question={selectQuestion()}
					submitted=""
				/>,
			);
			expect(radio("Judul, deskripsi, dan tag").checked).toBe(true);
		}
	});

	it("21-22. options stay native, grouped, and focusable; a rerender does not remount", () => {
		const { rerender, props } = renderQuestion();

		const before = radio("Hanya judul");
		before.focus();
		expect(document.activeElement).toBe(before);

		const group = screen.getAllByRole("radio") as HTMLInputElement[];
		expect(new Set(group.map((input) => input.name)).size).toBe(1);
		expect(group.every((input) => input.type === "radio")).toBe(true);
		expect(
			screen.getByRole("radiogroup", {
				name: "Bagaimana cakupan pencarian kata kunci?",
			}),
		).toBeTruthy();

		rerender(
			<CodebaseAdaptiveQuestion {...props} question={selectQuestion()} />,
		);
		expect(radio("Hanya judul")).toBe(before);
	});

	it("23-24. an unrelated run/composer update in the workspace keeps the selection", () => {
		const onSubmit = vi.fn();
		const questions = [selectQuestion(), textQuestion()];
		const baseProps = {
			featureName: "Pencarian Artikel",
			projectId: "proj-1",
			codebaseId: "repo-1",
			messages: [{ id: "m1", role: "user" as const, content: "Mulai" }],
			questions,
			answers: {},
			onSubmitAnswer: onSubmit,
		};
		const { rerender } = render(<CodebaseChatWorkspace {...baseProps} />);

		fireEvent.click(radio("Judul dan deskripsi"));
		expect(radio("Judul dan deskripsi").checked).toBe(true);

		rerender(
			<CodebaseChatWorkspace
				{...baseProps}
				run={startRun("questions", 1_000)}
			/>,
		);
		expect(radio("Judul dan deskripsi").checked).toBe(true);

		rerender(
			<CodebaseChatWorkspace
				{...baseProps}
				run={settleRun(startRun("questions", 1_000), "done", 2_000)}
			/>,
		);
		expect(radio("Judul dan deskripsi").checked).toBe(true);

		fireEvent.click(screen.getByTestId("composer-mode-trigger"));
		expect(radioIgnoringAriaHidden("Judul dan deskripsi").checked).toBe(true);
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
