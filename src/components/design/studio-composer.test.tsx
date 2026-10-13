// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveComposerScope, StudioComposer } from "./studio-composer";

describe("resolveComposerScope", () => {
	it("targets the whole project when no frame is selected", () => {
		expect(resolveComposerScope(0)).toBe("project");
	});

	it("targets exactly the selected frames when one is selected", () => {
		expect(resolveComposerScope(1)).toBe("revise");
	});

	it("targets exactly the selected frames when several are selected", () => {
		expect(resolveComposerScope(4)).toBe("revise");
	});
});

describe("StudioComposer", () => {
	afterEach(() => cleanup());

	it("shows the project scope when no frame is selected", () => {
		render(<StudioComposer onSubmit={vi.fn()} loading={false} />);

		// Scope is communicated by the placeholder, not a static control label.
		expect(
			screen.getByPlaceholderText(/Minta revisi untuk seluruh project/i),
		).toBeDefined();
		expect(screen.queryByText("Seluruh project")).toBeNull();
	});

	it("does not render the removed composer controls", () => {
		render(
			<StudioComposer
				onSubmit={vi.fn()}
				loading={false}
				selectedFrames={[{ id: "f-1", name: "Dashboard" }]}
			/>,
		);

		expect(screen.queryByText(/Tambah Halaman/i)).toBeNull();
		expect(screen.queryByText(/Seluruh project/i)).toBeNull();
		// The palette icon is gone with its trigger.
		expect(
			screen.queryByRole("button", { name: /Pilih design system/i }),
		).toBeNull();
	});

	it("targets a single selected frame and allows deselecting it", () => {
		const onRemoveFrame = vi.fn();
		render(
			<StudioComposer
				onSubmit={vi.fn()}
				loading={false}
				selectedFrames={[{ id: "f-1", name: "Dashboard" }]}
				onRemoveFrame={onRemoveFrame}
			/>,
		);

		expect(screen.getByText(/Editing: Dashboard/i)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: /Lepas Dashboard/i }));
		expect(onRemoveFrame).toHaveBeenCalledWith("f-1");
	});

	it("submits a revise request scoped to the selected frame", () => {
		const onSubmit = vi.fn();
		render(
			<StudioComposer
				onSubmit={onSubmit}
				loading={false}
				selectedFrames={[{ id: "f-1", name: "Dashboard" }]}
			/>,
		);

		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Ubah warna header jadi biru" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			"Ubah warna header jadi biru",
			"revise",
		);
	});

	it("submits a project-scoped request when nothing is selected", () => {
		const onSubmit = vi.fn();
		render(<StudioComposer onSubmit={onSubmit} loading={false} />);

		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Samakan radius kartu di semua layar" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			"Samakan radius kartu di semua layar",
			"project",
		);
	});

	it("reports the multi-frame count and targets all selected frames", () => {
		const onSubmit = vi.fn();
		render(
			<StudioComposer
				onSubmit={onSubmit}
				loading={false}
				selectedFrames={[
					{ id: "f-1", name: "Dashboard" },
					{ id: "f-2", name: "Transactions" },
				]}
			/>,
		);

		expect(screen.getByText(/Merevisi 2 layar terpilih/i)).toBeDefined();
		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Rapatkan spacing kartu metrik" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));

		expect(onSubmit).toHaveBeenCalledWith(
			"Rapatkan spacing kartu metrik",
			"revise",
		);
	});

	it("submits on Enter and keeps Shift+Enter for new lines", () => {
		const onSubmit = vi.fn(() => true);
		render(<StudioComposer onSubmit={onSubmit} loading={false} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Revisi seluruh project" } });
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		expect(onSubmit).not.toHaveBeenCalled();

		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmit).toHaveBeenCalledWith("Revisi seluruh project", "project");
	});

	it("does not submit while an IME composition is active", () => {
		const onSubmit = vi.fn();
		render(<StudioComposer onSubmit={onSubmit} loading={false} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Mengubah tata letak" } });
		fireEvent.keyDown(input, { key: "Enter", isComposing: true });

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("preserves rejected drafts and prevents repeated pending submissions", async () => {
		let settle: (accepted: boolean) => void = () => {};
		const onSubmit = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					settle = resolve;
				}),
		);
		render(<StudioComposer onSubmit={onSubmit} />);
		const input = screen.getByRole("textbox");
		fireEvent.change(input, {
			target: { value: "Change the project spacing" },
		});
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmit).toHaveBeenCalledTimes(1);
		settle(false);
		await waitFor(() =>
			expect(screen.getByRole("textbox")).toHaveProperty(
				"value",
				"Change the project spacing",
			),
		);
	});

	it("clears the draft only after the request is accepted", async () => {
		const onSubmit = vi.fn(async () => true);
		render(<StudioComposer onSubmit={onSubmit} />);
		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Ganti tipografi judul" } });
		fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));

		await waitFor(() =>
			expect(screen.getByRole("textbox")).toHaveProperty("value", ""),
		);
	});

	it("shows the stored skill and reference without a page count control", () => {
		render(
			<StudioComposer
				onSubmit={vi.fn()}
				loading={false}
				designSkillId="impeccable"
				onDesignSkillChange={vi.fn()}
				referenceLabel="Workspace"
			/>,
		);

		expect(
			screen.getByRole("button", { name: /Design skill: Impeccable/i }),
		).toBeDefined();
		expect(screen.getByText("Workspace")).toBeDefined();
		expect(screen.queryByText(/halaman awal/i)).toBeNull();
	});

	it("surfaces a thrown failure so the user can retry", async () => {
		const onSubmit = vi.fn(async () => {
			throw new Error("Permintaan desain ditolak.");
		});
		render(<StudioComposer onSubmit={onSubmit} />);
		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Ganti warna aksen" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));

		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Permintaan desain ditolak.",
			),
		);
	});
});
