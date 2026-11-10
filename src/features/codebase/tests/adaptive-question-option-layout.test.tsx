// @vitest-environment jsdom
import { RadioGroup } from "@heroui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodebaseAdaptiveQuestionOptionRow } from "../components/chat/codebase-adaptive-question-option-row";

const SEARCH_DESCRIPTION =
	"Pengunjung bisa menemukan proyek lewat nama, ringkasan, atau teknologi yang dipakai pada setiap kartu proyek.";
const CUSTOM_DESCRIPTION =
	"Tulis jawabanmu sendiri bila tidak ada pilihan yang sesuai.";

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

function renderOptions() {
	render(
		<RadioGroup aria-label="Cakupan pencarian">
			<CodebaseAdaptiveQuestionOptionRow
				inputType="radio"
				value="search-opt1"
				disabled={false}
				heading="Judul, deskripsi, dan teknologi"
				description={SEARCH_DESCRIPTION}
			/>
			<CodebaseAdaptiveQuestionOptionRow
				inputType="radio"
				value="search-custom"
				disabled={false}
				heading="Lainnya"
				description={CUSTOM_DESCRIPTION}
			>
				<input aria-label="Jawaban lain" />
			</CodebaseAdaptiveQuestionOptionRow>
		</RadioGroup>,
	);
}

afterEach(cleanup);

describe("P04 — adaptive option layout", () => {
	it("keeps heading, description, and control on one card without an indent", () => {
		renderOptions();

		const heading = screen.getByText("Judul, deskripsi, dan teknologi");
		const description = screen.getByText(SEARCH_DESCRIPTION);
		const card = screen
			.getByRole("radio", {
				name: /^Judul, deskripsi, dan teknologi$/i,
			})
			.closest("label")?.parentElement as HTMLElement;
		const label = heading.closest("label") as HTMLElement;

		// One card owns the control row and the description it explains.
		expect(card.contains(label)).toBe(true);
		expect(description.parentElement).toBe(card);

		// The description is a sibling of the clickable row, not part of it, so the
		// option still announces the heading as its name and the description as its
		// description — a wrapped line cannot leak into the label.
		expect(label.contains(description)).toBe(false);
		expect(label.textContent).toBe("Judul, deskripsi, dan teknologi");
		expect(
			describedText(screen.getByRole("radio", { name: /^Judul, deskripsi/i })),
		).toBe(SEARCH_DESCRIPTION);

		// Alignment comes from the card's own columns, never from a per-element
		// offset: no node inside the option carries an inline indent (the only
		// inline padding belongs to React Aria's visually hidden input wrapper,
		// which is zero).
		const inlineIndents = [...card.querySelectorAll<HTMLElement>("*")].flatMap(
			(node) =>
				[
					node.style.getPropertyValue("padding-inline-start"),
					node.style.getPropertyValue("padding-left"),
				].filter((value) => value !== "" && value !== "0px"),
		);
		expect(inlineIndents).toEqual([]);
	});

	it("puts the revealed free-text field on the same column as the option's own rows", () => {
		renderOptions();

		const lainnya = screen.getByRole("radio", { name: /^Lainnya$/i });
		const card = lainnya.closest("label")?.parentElement as HTMLElement;
		const field = screen.getByLabelText("Jawaban lain");
		const description = screen.getByText(CUSTOM_DESCRIPTION);

		// The field continues the option's card instead of becoming a second card
		// beside the text column.
		expect(card.contains(field)).toBe(true);
		// Its row is one of the card's own rows, on the same column as the
		// description it sits under.
		expect(field.parentElement?.parentElement).toBe(card);
		expect(field.parentElement?.parentElement).toBe(description.parentElement);
		// It is outside the clickable label, so typing in it never re-selects the
		// option it belongs to.
		expect((lainnya.closest("label") as HTMLElement).contains(field)).toBe(
			false,
		);
	});

	it("keeps the option selectable as a whole card with a keyboard-reachable control", () => {
		renderOptions();

		const control = screen.getByRole("radio", { name: /^Lainnya$/i });
		expect((control as HTMLInputElement).type).toBe("radio");

		// The control is a real native input, and the card is its label: the whole
		// surface is the hit area React Aria wires up.
		const label = control.closest("label") as HTMLElement;
		expect(label).toBeTruthy();
		expect(label.getAttribute("for")).toBeNull();
		expect(label.contains(control)).toBe(true);
		// No custom keyboard model: no tabindex was invented on the card.
		expect(label.getAttribute("tabindex")).toBeNull();
		expect(vi.isMockFunction(control.click)).toBe(false);
	});
});
