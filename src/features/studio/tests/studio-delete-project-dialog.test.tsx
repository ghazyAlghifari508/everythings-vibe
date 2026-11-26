// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioDeleteProjectDialog } from "@/features/studio/components/workspace/studio-delete-project-dialog";

function installRadixDomPolyfills() {
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

beforeEach(() => {
	installRadixDomPolyfills();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("StudioDeleteProjectDialog", () => {
	it("renders correct title with dynamic project name", () => {
		const { rerender } = render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name="CatatDompet"
				onDelete={async () => {}}
			/>,
		);

		const firstHeading = screen.getByRole("heading", {
			name: 'Hapus project "CatatDompet"?',
		});
		expect(firstHeading).toBeDefined();
		expect(firstHeading.textContent).toBe('Hapus project "CatatDompet"?');

		rerender(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name="SaaS Analytics Dashboard"
				onDelete={async () => {}}
			/>,
		);

		const secondHeading = screen.getByRole("heading", {
			name: 'Hapus project "SaaS Analytics Dashboard"?',
		});
		expect(secondHeading).toBeDefined();
		expect(secondHeading.textContent).toBe(
			'Hapus project "SaaS Analytics Dashboard"?',
		);
	});

	it("handles very long project names without breaking modal layout", () => {
		const longName =
			"ProjectSuperLongNameWithoutAnySpacesOrPunctuationThatCouldOverflowContainersUnlessSafelyWrappedByBreakWordsUtilityClass1234567890";

		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name={longName}
				onDelete={async () => {}}
			/>,
		);

		const heading = screen.getByRole("heading");
		expect(heading.textContent).toBe(`Hapus project "${longName}"?`);
		expect(heading.className).toContain("break-words");
	});

	it("renders accurate warning copy regarding pages, revision history, and assets", () => {
		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name="CatatDompet"
				onDelete={async () => {}}
			/>,
		);

		const expectedWarning =
			"Semua halaman, riwayat perubahan, dan aset dalam project ini akan dihapus permanen. Project yang dihapus tidak bisa dipulihkan.";

		const desc = screen.getByText(expectedWarning);
		expect(desc).toBeDefined();
		expect(desc.textContent).toBe(expectedWarning);
	});

	it("clicking cancel closes the dialog via onOpenChange", () => {
		const onOpenChange = vi.fn();
		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={onOpenChange}
				name="CatatDompet"
				onDelete={async () => {}}
			/>,
		);

		const cancelButton = screen.getByRole("button", { name: "Batal" });
		fireEvent.click(cancelButton);

		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("confirm button calls onDelete handler once and closes dialog upon resolution", async () => {
		const onDelete = vi.fn(async () => {});
		const onOpenChange = vi.fn();

		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={onOpenChange}
				name="CatatDompet"
				onDelete={onDelete}
			/>,
		);

		const confirmButton = screen.getByRole("button", { name: "Hapus project" });
		fireEvent.click(confirmButton);

		await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("pending state prevents duplicate destructive calls and disables buttons", async () => {
		let resolveDelete!: () => void;
		const deletePromise = new Promise<void>((resolve) => {
			resolveDelete = resolve;
		});
		const onDelete = vi.fn(() => deletePromise);
		const onOpenChange = vi.fn();

		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={onOpenChange}
				name="CatatDompet"
				onDelete={onDelete}
			/>,
		);

		const confirmButton = screen.getByRole("button", { name: "Hapus project" });
		const cancelButton = screen.getByRole("button", { name: "Batal" });

		fireEvent.click(confirmButton);

		// Now in pending state
		expect(screen.getByText("Menghapus...")).toBeDefined();
		expect(confirmButton.hasAttribute("disabled")).toBe(true);
		expect(cancelButton.hasAttribute("disabled")).toBe(true);

		// Clicking again while pending must not trigger a second deletion
		fireEvent.click(confirmButton);
		expect(onDelete).toHaveBeenCalledTimes(1);

		// Attempting to close modal while pending should be ignored
		fireEvent.click(cancelButton);
		expect(onOpenChange).not.toHaveBeenCalled();

		// Resolve promise
		resolveDelete();
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("displays clear error message when deletion fails", async () => {
		const onDelete = vi.fn(async () => {
			throw new Error("Koneksi database terputus");
		});

		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name="CatatDompet"
				onDelete={onDelete}
			/>,
		);

		const confirmButton = screen.getByRole("button", { name: "Hapus project" });
		fireEvent.click(confirmButton);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Koneksi database terputus");
		expect(alert.className).toContain("text-crimson");

		// Buttons should be re-enabled after failure
		const confirmBtnAfter = screen.getByRole("button", {
			name: "Hapus project",
		});
		const cancelBtnAfter = screen.getByRole("button", { name: "Batal" });
		expect(confirmBtnAfter.hasAttribute("disabled")).toBe(false);
		expect(cancelBtnAfter.hasAttribute("disabled")).toBe(false);
	});

	it("contains zero em dashes or en dashes in user-facing copy", () => {
		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name="CatatDompet"
				onDelete={async () => {}}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		const text = dialog.textContent || "";

		// Verify no em dash (\u2014) or en dash (\u2013)
		expect(text).not.toContain("\u2014");
		expect(text).not.toContain("\u2013");
		expect(text).not.toContain("—");
		expect(text).not.toContain("–");
	});

	it("renders an appropriate delete icon consistent with the design system", () => {
		render(
			<StudioDeleteProjectDialog
				open
				onOpenChange={() => {}}
				name="CatatDompet"
				onDelete={async () => {}}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		const svgs = dialog.querySelectorAll("svg");
		expect(svgs.length).toBeGreaterThanOrEqual(1);
	});
});
