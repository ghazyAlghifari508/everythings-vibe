// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseLibraryDeleteDialog } from "@/features/codebase/components/planning/codebase-library-delete-dialog";
import { ProjectActionsMenu } from "@/features/codebase/components/planning/project-actions-menu";
import type { CodebaseLibraryItem } from "@/features/codebase/services/library";

function installRadixDomPolyfills() {
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

const sampleItem: CodebaseLibraryItem = {
	id: "cb-test-1",
	name: "Test Repository",
	updatedAt: "2025-01-01T00:00:00Z",
	fileCount: 42,
	snapshotCreatedAt: "2025-01-01T00:00:00Z",
	snapshotStatus: "uploaded",
	summary: "Testing destructive dialogs",
	framework: "React",
	language: "TypeScript",
	packageManager: "pnpm",
	hasReadyAnalysis: true,
	hasUsableSnapshot: true,
	analysisAttemptStatus: "ready",
	onboardingProjectId: null,
	readiness: "planning_ready",
	planCount: 2,
};

beforeEach(() => {
	installRadixDomPolyfills();
});

afterEach(() => {
	cleanup();
});

describe("Destructive dialog consistency (FIX 06)", () => {
	it("renders CodebaseLibraryDeleteDialog single delete with expected text and no duplicate close button", () => {
		const onCancel = vi.fn();
		const onConfirm = vi.fn();

		render(
			<CodebaseLibraryDeleteDialog
				request={{ kind: "single", item: sampleItem }}
				deleting={false}
				onCancel={onCancel}
				onConfirm={onConfirm}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeDefined();

		// Verify expected visual hierarchy from p6.md section 5
		expect(screen.getByText("Hapus project?")).toBeDefined();
		expect(
			screen.getByText("Project dan planning terkait akan dihapus permanen."),
		).toBeDefined();

		// Unified action buttons
		const cancelBtn = screen.getByRole("button", { name: "Batal" });
		const deleteBtn = screen.getByRole("button", { name: "Hapus project" });
		expect(cancelBtn).toBeDefined();
		expect(deleteBtn).toBeDefined();

		// Destructive button uses semantic styling
		expect(deleteBtn.className).toContain("bg-crimson");

		// No duplicate close ("X") button in the dialog
		expect(screen.queryByLabelText("Close")).toBeNull();
		expect(screen.queryByLabelText("Tutup")).toBeNull();

		// Actions work
		fireEvent.click(cancelBtn);
		expect(onCancel).toHaveBeenCalledTimes(1);

		fireEvent.click(deleteBtn);
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("renders CodebaseLibraryDeleteDialog bulk delete with unified buttons", () => {
		const onCancel = vi.fn();
		const onConfirm = vi.fn();

		render(
			<CodebaseLibraryDeleteDialog
				request={{ kind: "bulk", count: 3 }}
				deleting={false}
				onCancel={onCancel}
				onConfirm={onConfirm}
			/>,
		);

		expect(screen.getByText("Hapus 3 repository?")).toBeDefined();
		expect(screen.getByRole("button", { name: "Hapus 3" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Batal" })).toBeDefined();
		expect(screen.queryByLabelText("Close")).toBeNull();
	});

	it("renders ProjectActionsMenu delete dialog with matching copy and no duplicate close button", async () => {
		const onDelete = vi.fn().mockResolvedValue(undefined);
		const onRename = vi.fn();

		render(
			<ProjectActionsMenu
				item={sampleItem}
				onRename={onRename}
				onDelete={onDelete}
			/>,
		);

		// Open menu via pointerDown for Radix DropdownMenu
		const trigger = screen.getByRole("button", {
			name: `Aksi project ${sampleItem.name}`,
		});
		fireEvent.pointerDown(trigger, {
			button: 0,
			ctrlKey: false,
			pointerType: "mouse",
		});

		const deleteMenuItem = screen.getByRole("menuitem", {
			name: /Hapus project/i,
		});
		fireEvent.click(deleteMenuItem);

		// Dialog opens
		expect(screen.getByRole("dialog")).toBeDefined();
		expect(screen.getByText("Hapus project?")).toBeDefined();
		expect(
			screen.getByText("Project dan planning terkait akan dihapus permanen."),
		).toBeDefined();

		const cancelBtn = screen.getByRole("button", { name: "Batal" });
		const deleteBtn = screen.getByRole("button", { name: "Hapus project" });
		expect(cancelBtn).toBeDefined();
		expect(deleteBtn).toBeDefined();

		// No duplicate close ("X") button
		expect(screen.queryByLabelText("Close")).toBeNull();

		// Click delete
		fireEvent.click(deleteBtn);
		expect(onDelete).toHaveBeenCalledWith(sampleItem);
	});
});
