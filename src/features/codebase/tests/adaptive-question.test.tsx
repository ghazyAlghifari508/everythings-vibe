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
import { CodebaseAdaptiveQuestion } from "../components/chat/codebase-adaptive-question";

/** Option ids in the order the user actually sees them. */
function controlValues(): string[] {
	return screen
		.getAllByRole("radio")
		.map((control) => control.getAttribute("value") ?? "");
}

/** The text an option announces as its description, resolved the way an
 *  assistive technology resolves it: through `aria-describedby`. */
function describedText(control: HTMLElement): string {
	const ids = control.getAttribute("aria-describedby");
	if (!ids) return "";
	return ids
		.split(/\s+/)
		.map((id) => document.getElementById(id)?.textContent ?? "")
		.join(" ")
		.trim();
}

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

			// Progress counter: question index and total, without a stage badge.
			expect(screen.getByText("2 dari 4")).toBeDefined();
			expect(screen.queryByText("Klarifikasi")).toBeNull();
			expect(screen.getByText("Pertanyaan 2")).toBeDefined();
			expect(
				screen.getByText("Bagaimana filter kategori bekerja?"),
			).toBeDefined();
		});

		it("explains the recommended option on the option itself, not in a separate panel", () => {
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

			// Legacy stored question: no descriptions, so the recommendation reason
			// stands in for the recommended option's explanation — announced as that
			// option's description, never as a separate block under the whole list.
			const recommended = screen.getByRole("radio", {
				name: /Satu kategori sekaligus/i,
			});
			expect(describedText(recommended)).toContain(
				"Codebase saat ini menggunakan single filter parameter pada URL.",
			);
			// The justification is rendered exactly once — on the recommended option
			// itself — so no second panel repeats it anywhere on the card.
			expect(
				(document.body.textContent ?? "").split(
					"Codebase saat ini menggunakan single filter parameter pada URL.",
				).length - 1,
			).toBe(1);
		});

		it("renders a heading and a description for every option that has one", () => {
			const onSubmit = vi.fn();
			const richQuestion: AdaptiveQuestion = {
				id: "search_scope",
				title: "Informasi apa saja yang perlu dicari?",
				type: "select",
				options: [
					{
						id: "search_scope-opt1",
						label: "Judul, deskripsi, dan teknologi",
						description:
							"Pengunjung bisa menemukan proyek lewat nama, ringkasan, atau teknologi yang dipakai.",
					},
					{
						id: "search_scope-opt2",
						label: "Judul proyek saja",
						description: "Pencarian hanya mencocokkan nama proyek.",
					},
					{
						id: "search_scope-opt3",
						label: "Tentukan sendiri",
						description: "Cakupan ditentukan pengguna.",
						recommended: true,
					},
				],
				recommendedOptionId: "search_scope-opt3",
				recommendationReason: "Metadata internal",
			};
			render(
				<CodebaseAdaptiveQuestion
					question={richQuestion}
					index={1}
					totalQuestions={3}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			for (const option of richQuestion.options) {
				const control = screen.getByRole("radio", {
					name: new RegExp(option.label, "i"),
				});
				// The heading is the control's accessible name; the description is
				// the text it announces, resolved through the same wiring an
				// assistive technology uses.
				expect(describedText(control)).toBe(option.description);
			}
			// The option already explains itself, so the internal recommendation
			// metadata is not repeated on screen.
			expect(document.body.textContent).not.toContain("Metadata internal");
			// The recommended option is first and marked, but never auto-selected.
			expect(controlValues()[0]).toBe("search_scope-opt3");
			const recommended = screen.getByRole("radio", {
				name: /Tentukan sendiri/i,
			});
			expect((recommended as HTMLInputElement).checked).toBe(false);
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

		it("moves to the option the user switched to after leaving Lainnya", () => {
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

			act(() => {
				fireEvent.click(screen.getByRole("radio", { name: /Lainnya/i }));
			});
			const customInput = screen.getByLabelText("Jawaban lain");
			act(() => {
				fireEvent.change(customInput, {
					target: { value: "Dropdown hierarkis" },
				});
			});

			act(() => {
				fireEvent.click(
					screen.getByRole("radio", { name: /Beberapa kategori bersamaan/i }),
				);
			});
			expect(screen.queryByLabelText("Jawaban lain")).toBeNull();

			act(() => {
				fireEvent.click(screen.getByRole("button", { name: /Konfirmasi/i }));
			});
			expect(onSubmit).toHaveBeenCalledWith(
				"filter_type",
				"Beberapa kategori bersamaan",
			);
		});

		it("keeps Lainnya usable in multiselect and joins it with the choices", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={multiQuestion}
					index={1}
					totalQuestions={3}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			act(() => {
				fireEvent.click(screen.getByRole("checkbox", { name: /Judul/i }));
				fireEvent.click(screen.getByRole("checkbox", { name: /Lainnya/i }));
			});

			const submitBtn = screen.getByRole("button", { name: /Konfirmasi/i });
			expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

			const customInput = screen.getByLabelText("Jawaban lain");
			act(() => {
				fireEvent.change(customInput, {
					target: { value: "Penulis tamu" },
				});
			});
			expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

			act(() => {
				fireEvent.click(submitBtn);
			});
			expect(onSubmit).toHaveBeenCalledWith(
				"export_fields",
				"Judul, Penulis tamu",
			);
		});
	});

	describe("Recommended option, choice cards, and keyboard access", () => {
		const orderingQuestion: AdaptiveQuestion = {
			id: "scope",
			title: "Informasi apa saja yang perlu dicari?",
			type: "select",
			options: [
				{ id: "scope-opt1", label: "Judul dan deskripsi" },
				{
					id: "scope-opt2",
					label: "Judul proyek saja",
					description: "Cocok untuk daftar proyek sederhana.",
				},
				{
					id: "scope-opt3",
					label: "Judul, deskripsi, dan teknologi",
					description: "Cakupan terluas.",
					recommended: true,
				},
			],
			recommendedOptionId: "scope-opt3",
		};

		it("renders the recommended option first and keeps every option id stable", () => {
			render(
				<CodebaseAdaptiveQuestion
					question={orderingQuestion}
					index={1}
					totalQuestions={4}
					submitted=""
					active={true}
					onSubmit={vi.fn()}
				/>,
			);

			// Recommended first, every other option in its original relative order.
			// The custom option stays last: it is not part of the recommendation.
			expect(controlValues()).toEqual([
				"scope-opt3",
				"scope-opt1",
				"scope-opt2",
				"scope-custom",
			]);
		});

		it("marks only the recommended option and never pre-selects it", () => {
			render(
				<CodebaseAdaptiveQuestion
					question={orderingQuestion}
					index={1}
					totalQuestions={4}
					submitted=""
					active={true}
					onSubmit={vi.fn()}
				/>,
			);

			expect(screen.getAllByText("Rekomendasi")).toHaveLength(1);
			const recommended = screen.getByRole("radio", {
				name: /Judul, deskripsi, dan teknologi/i,
			});
			expect((recommended as HTMLInputElement).checked).toBe(false);
			expect(
				screen.getByRole("button", { name: /Konfirmasi/i }),
			).toHaveProperty("disabled", true);
		});

		it("keeps the already saved answer on its own option when the recommended one is shown first", () => {
			render(
				<CodebaseAdaptiveQuestion
					question={orderingQuestion}
					index={1}
					totalQuestions={4}
					submitted="Judul dan deskripsi"
					active={true}
					isEditing={true}
					onSubmit={vi.fn()}
					onCancelEdit={vi.fn()}
				/>,
			);

			expect(controlValues()[0]).toBe("scope-opt3");
			const saved = screen.getByRole("radio", {
				name: /^Judul dan deskripsi$/i,
			});
			expect((saved as HTMLInputElement).checked).toBe(true);
		});

		it("exposes one tab stop, a labelled group, and native radio grouping", () => {
			render(
				<CodebaseAdaptiveQuestion
					question={orderingQuestion}
					index={1}
					totalQuestions={4}
					submitted=""
					active={true}
					onSubmit={vi.fn()}
				/>,
			);

			// The group is labelled by the question heading, so a screen reader
			// announces the question before the options.
			const group = screen.getByRole("radiogroup");
			expect(
				document.getElementById(group.getAttribute("aria-labelledby") ?? "")
					?.textContent,
			).toBe(orderingQuestion.title);

			// Native radios sharing one name: the browser and React Aria handle
			// arrow-key selection, so the card must not invent its own keyboard model.
			const controls = screen.getAllByRole("radio") as HTMLInputElement[];
			expect(controls.every((control) => control.type === "radio")).toBe(true);
			expect(new Set(controls.map((control) => control.name)).size).toBe(1);

			// Choosing an option moves the single tab stop onto it, as a radio group
			// must: the rest of the group leaves the tab order.
			act(() => {
				fireEvent.click(controls[1]);
			});
			expect(controls[1].checked).toBe(true);
			const tabbable = controls.filter(
				(control) => control.getAttribute("tabindex") === "0",
			);
			expect(tabbable).toEqual([controls[1]]);
		});

		it("reveals the free-text field inside the Lainnya option's own card", () => {
			render(
				<CodebaseAdaptiveQuestion
					question={orderingQuestion}
					index={1}
					totalQuestions={4}
					submitted=""
					active={true}
					onSubmit={vi.fn()}
				/>,
			);

			const lainnya = screen.getByRole("radio", { name: /Lainnya/i });
			expect(describedText(lainnya)).toBe(
				"Tulis jawabanmu sendiri bila tidak ada pilihan yang sesuai.",
			);

			act(() => {
				fireEvent.click(lainnya);
			});

			const input = screen.getByLabelText("Jawaban lain");
			// Same card as the option it belongs to, not a second one beside the list.
			expect(lainnya.closest("label")?.parentElement?.contains(input)).toBe(
				true,
			);
		});

		it("keeps two questions on one card independent", () => {
			const onSubmit = vi.fn();
			const second: AdaptiveQuestion = {
				id: "surfaces",
				title: "Permukaan mana yang ikut dicari?",
				type: "multiselect",
				options: [
					{ id: "surfaces-opt1", label: "Artikel" },
					{ id: "surfaces-opt2", label: "Produk" },
				],
			};
			render(
				<>
					<CodebaseAdaptiveQuestion
						question={orderingQuestion}
						index={1}
						totalQuestions={2}
						submitted=""
						active={true}
						onSubmit={onSubmit}
					/>
					<CodebaseAdaptiveQuestion
						question={second}
						index={2}
						totalQuestions={2}
						submitted=""
						active={true}
						onSubmit={onSubmit}
					/>
				</>,
			);

			act(() => {
				fireEvent.click(screen.getByRole("checkbox", { name: /Artikel/i }));
			});

			// The other question's draft is untouched by a choice made elsewhere.
			expect(
				screen
					.getAllByRole("radio")
					.some((control) => (control as HTMLInputElement).checked),
			).toBe(false);

			act(() => {
				fireEvent.click(
					screen.getAllByRole("button", { name: /Konfirmasi/i })[1],
				);
			});
			expect(onSubmit).toHaveBeenCalledWith("surfaces", "Artikel");
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

		it("does not submit on Enter while an IME composition is still open", () => {
			const onSubmit = vi.fn();
			render(
				<CodebaseAdaptiveQuestion
					question={textQuestion}
					index={1}
					totalQuestions={1}
					submitted=""
					active={true}
					onSubmit={onSubmit}
				/>,
			);

			const input = screen.getByPlaceholderText("Tuliskan preferensi Anda...");
			act(() => {
				fireEvent.change(input, { target: { value: "ぺる" } });
			});
			act(() => {
				fireEvent.keyDown(input, { key: "Enter", isComposing: true });
			});
			expect(onSubmit).not.toHaveBeenCalled();

			act(() => {
				fireEvent.keyDown(input, { key: "Enter" });
			});
			expect(onSubmit).toHaveBeenCalledWith("custom_notes", "ぺる");
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
