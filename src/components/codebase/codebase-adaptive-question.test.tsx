// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestion } from "./codebase-adaptive-question";

describe("CodebaseAdaptiveQuestion Component", () => {
	afterEach(() => {
		cleanup();
	});

	const selectQuestion: AdaptiveQuestion = {
		id: "filter_type",
		title: "Bagaimana filter kategori bekerja?",
		type: "select",
		options: [
			{
				id: "filter_type-opt1",
				label: "Satu kategori sekaligus",
				recommended: true,
			},
			{
				id: "filter_type-opt2",
				label: "Beberapa kategori bersamaan",
				recommended: false,
			},
			{
				id: "filter_type-opt3",
				label: "Semua kategori secara default",
				recommended: false,
			},
		],
		recommendedOptionId: "filter_type-opt1",
		recommendationReason:
			"Codebase saat ini menggunakan single filter parameter pada URL.",
	};

	const multiQuestion: AdaptiveQuestion = {
		id: "export_fields",
		title: "Field apa saja yang perlu disertakan?",
		type: "multiselect",
		options: [
			{ id: "export_fields-opt1", label: "Judul", recommended: false },
			{ id: "export_fields-opt2", label: "Penulis", recommended: false },
			{ id: "export_fields-opt3", label: "Tanggal", recommended: false },
		],
	};

	const textQuestion: AdaptiveQuestion = {
		id: "custom_notes",
		title: "Ada catatan khusus untuk fitur ini?",
		type: "text",
		options: [],
		customPlaceholder: "Tuliskan preferensi Anda...",
	};

	describe("Active Question Card (Progressive Disclosure)", () => {
		it("renders progress counter and question title clearly", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={selectQuestion}
					index={2}
					totalQuestions={4}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			// Progress counter
			expect(screen.getByText("2 dari 4")).toBeDefined();
			expect(screen.getByText("Klarifikasi")).toBeDefined();
			expect(screen.getByText("Pertanyaan 2")).toBeDefined();
			expect(
				screen.getByText("Bagaimana filter kategori bekerja?"),
			).toBeDefined();
		});

		it("displays the recommendation label and reason grounded in codebase context", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={selectQuestion}
					index={2}
					totalQuestions={4}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			const reasonEl = screen.getByTestId(
				"adaptive-question-reason-filter_type",
			);
			expect(reasonEl.textContent).toContain("Satu kategori sekaligus");
			expect(reasonEl.textContent).toContain(
				"Codebase saat ini menggunakan single filter parameter pada URL.",
			);
		});

		it("keeps submit disabled until a choice is selected, then submits the choice", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={selectQuestion}
					index={1}
					totalQuestions={3}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			const submitBtn = screen.getByRole("button", { name: /Konfirmasi/i });
			expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

			const option1 = screen.getByRole("radio", {
				name: /Satu kategori sekaligus/i,
			});
			act(() => {
				fireEvent.click(option1);
			});

			expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

			act(() => {
				fireEvent.click(submitBtn);
			});

			expect(onSubmit).toHaveBeenCalledWith(
				"filter_type",
				"Satu kategori sekaligus",
			);
		});

		it("supports 'Lainnya' free-text choice in single select", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={selectQuestion}
					index={1}
					totalQuestions={3}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			const submitBtn = screen.getByRole("button", { name: /Konfirmasi/i });
			const lainnyaRadio = screen.getByRole("radio", { name: /Lainnya/i });

			act(() => {
				fireEvent.click(lainnyaRadio);
			});

			// Field is revealed but empty, submit still disabled
			expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

			const customInput = screen.getByPlaceholderText(
				"Tulis jawabanmu sendiri...",
			);
			act(() => {
				fireEvent.change(customInput, {
					target: { value: "Dropdown select hierarkis" },
				});
			});

			expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

			act(() => {
				fireEvent.click(submitBtn);
			});

			expect(onSubmit).toHaveBeenCalledWith(
				"filter_type",
				"Dropdown select hierarkis",
			);
		});
	});

	describe("Answered Question (Compact Completed Line)", () => {
		it("renders answered question as a compact completed line without radio inputs or green card bloat", () => {
			const onEdit = vi.fn();
			const onSubmit = vi.fn();
			const { container } = render(
				<CodebaseAdaptiveQuestion
					question={selectQuestion}
					index={1}
					totalQuestions={3}
					submitted="Satu kategori sekaligus"
					active={false}
					onSubmit={onSubmit}
					onEdit={onEdit}
				/>,
			);

			// Completed line text
			expect(container.textContent).toContain(
				"Q1 · Bagaimana filter kategori bekerja?",
			);
			expect(container.textContent).toContain(
				"Jawaban: Satu kategori sekaligus",
			);

			// No inputs in compact line
			expect(container.querySelector("input[type='radio']")).toBeNull();

			// Has edit trigger
			const editBtn = screen.getByRole("button", { name: /Ubah/i });
			expect(editBtn).toBeDefined();

			act(() => {
				fireEvent.click(editBtn);
			});

			expect(onEdit).toHaveBeenCalledWith("filter_type");
		});
	});

	describe("Editing Mode", () => {
		it("pre-fills previous answer in edit mode and allows updating or cancelling", () => {
			const onCancelEdit = vi.fn();
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={selectQuestion}
					index={1}
					totalQuestions={3}
					submitted="Satu kategori sekaligus"
					active={true}
					isEditing={true}
					onSubmit={onSubmit}
					onCancelEdit={onCancelEdit}
				/>,
			);

			// Radio inputs are present
			const opt1 = screen.getByRole("radio", {
				name: /Satu kategori sekaligus/i,
			});
			expect((opt1 as HTMLInputElement).checked).toBe(true);

			// Switch to option 2
			const opt2 = screen.getByRole("radio", {
				name: /Beberapa kategori bersamaan/i,
			});
			act(() => {
				fireEvent.click(opt2);
			});

			// Has Cancel button
			const cancelBtn = screen.getByRole("button", { name: /Batal/i });
			expect(cancelBtn).toBeDefined();

			const submitBtn = screen.getByRole("button", { name: /Konfirmasi/i });
			act(() => {
				fireEvent.click(submitBtn);
			});

			expect(onSubmit).toHaveBeenCalledWith(
				"filter_type",
				"Beberapa kategori bersamaan",
			);
		});
	});

	describe("Multi-select & Free Text", () => {
		it("supports multi-select checkboxes and joins choices", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={multiQuestion}
					index={2}
					totalQuestions={3}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			const chk1 = screen.getByRole("checkbox", { name: /Judul/i });
			const chk2 = screen.getByRole("checkbox", { name: /Tanggal/i });

			act(() => {
				fireEvent.click(chk1);
				fireEvent.click(chk2);
			});

			const submitBtn = screen.getByRole("button", { name: /Konfirmasi/i });
			act(() => {
				fireEvent.click(submitBtn);
			});

			expect(onSubmit).toHaveBeenCalledWith("export_fields", "Judul, Tanggal");
		});

		it("supports free-text input questions with Enter key submit", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={textQuestion}
					index={3}
					totalQuestions={3}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			const input = screen.getByPlaceholderText("Tuliskan preferensi Anda...");
			act(() => {
				fireEvent.change(input, {
					target: { value: "Perlu integrasi webhook" },
				});
			});

			act(() => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(onSubmit).toHaveBeenCalledWith(
				"custom_notes",
				"Perlu integrasi webhook",
			);
		});
	});
});
