// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioComposer } from "./studio-composer";

describe("StudioComposer", () => {
	afterEach(() => cleanup());

	it("renders project-wide target when no frame is selected", () => {
		render(
			<StudioComposer
				selectedFrameName={null}
				onClearSelectedFrame={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
			/>,
		);

		expect(screen.getByText("Seluruh Project")).toBeDefined();
		expect(
			screen.getByPlaceholderText(/Minta AI menambah halaman atau merevisi UI/i),
		).toBeDefined();
	});

	it("renders selected frame target pill when a frame is selected", () => {
		const onClear = vi.fn();
		render(
			<StudioComposer
				selectedFrameName="Dashboard"
				onClearSelectedFrame={onClear}
				onSubmit={vi.fn()}
				loading={false}
			/>,
		);

		expect(screen.getByText(/Editing: Dashboard/i)).toBeDefined();
		const clearBtn = screen.getByRole("button", { name: /Beralih ke seluruh project/i });
		fireEvent.click(clearBtn);
		expect(onClear).toHaveBeenCalled();
	});

	it("submits prompt when submit button is clicked", () => {
		const onSubmit = vi.fn();
		render(
			<StudioComposer
				selectedFrameName="Dashboard"
				onClearSelectedFrame={vi.fn()}
				onSubmit={onSubmit}
				loading={false}
			/>,
		);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, {
			target: { value: "Ubah warna header jadi biru" },
		});

		const submitBtn = screen.getByRole("button", { name: /Kirim prompt/i });
		fireEvent.click(submitBtn);

		expect(onSubmit).toHaveBeenCalledWith("Ubah warna header jadi biru");
	});

	it("applies quick action preset when clicked", () => {
		render(
			<StudioComposer
				selectedFrameName={null}
				onClearSelectedFrame={vi.fn()}
				onSubmit={vi.fn()}
				loading={false}
			/>,
		);

		const addPagePreset = screen.getByRole("button", { name: /\+ Tambah Halaman/i });
		fireEvent.click(addPagePreset);

		const input = screen.getByPlaceholderText(/Minta AI menambah halaman atau merevisi UI/i) as HTMLInputElement;
		expect(input.value).toContain("Tambahkan halaman ");
	});
});
