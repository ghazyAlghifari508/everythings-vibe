// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRenameProjectDialog } from "@/features/studio/components/workspace/studio-rename-project-dialog";
import { StudioSidebar } from "@/features/studio/components/workspace/studio-sidebar";
import type { StudioHistoryItem } from "@/features/studio/types/studio";

type SidebarProps = ComponentProps<typeof StudioSidebar>;

const project: StudioHistoryItem = {
	id: "p1",
	title: "Aroma Control",
	designMode: "web",
	hasDesignMd: false,
	hasLogo: false,
	createdAt: "2026-03-01T08:00:00Z",
};

// Radix menus and modals read layout through ResizeObserver and element rects,
// none of which jsdom implements. Without these the real primitives cannot be
// exercised in a component test.
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

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
	const props: SidebarProps = {
		history: [project],
		onSelectProject: vi.fn(),
		onDeleteProject: vi.fn(async () => {}),
		onRenameProject: vi.fn(async () => {}),
		onDuplicateProject: vi.fn(async () => {}),
		...overrides,
	};
	return render(<StudioSidebar {...props} />);
}

async function openActionsMenu(title = project.title) {
	fireEvent.pointerDown(
		screen.getByRole("button", { name: `Aksi project ${title}` }),
		{ button: 0, ctrlKey: false, pointerType: "mouse" },
	);
	return screen.findByRole("menuitem", { name: /Ganti nama/i });
}

describe("Studio project rename", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installRadixDomPolyfills();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("offers rename, duplicate and delete in the project action menu", async () => {
		renderSidebar();
		await openActionsMenu();

		expect(screen.getByRole("menuitem", { name: /Ganti nama/i })).toBeDefined();
		expect(
			screen.getByRole("menuitem", { name: /Duplikat project/i }),
		).toBeDefined();
		expect(
			screen.getByRole("menuitem", { name: /Hapus project/i }),
		).toBeDefined();
	});

	it("seeds the dialog with the current name and saves the normalized one", async () => {
		const onRenameProject = vi.fn(async () => {});
		renderSidebar({ onRenameProject });

		fireEvent.click(await openActionsMenu());
		const input =
			await screen.findByLabelText<HTMLInputElement>("Nama project");
		expect(input.value).toBe("Aroma Control");

		fireEvent.change(input, { target: { value: "  Aroma Operasional  " } });
		fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

		await waitFor(() =>
			expect(onRenameProject).toHaveBeenCalledWith("p1", "Aroma Operasional"),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("blocks a blank or unchanged name before any request", async () => {
		const onRenameProject = vi.fn(async () => {});
		renderSidebar({ onRenameProject });

		fireEvent.click(await openActionsMenu());
		const input =
			await screen.findByLabelText<HTMLInputElement>("Nama project");
		const save = screen.getByRole("button", { name: "Simpan" });
		expect((save as HTMLButtonElement).disabled).toBe(true);

		fireEvent.change(input, { target: { value: "   " } });
		expect((save as HTMLButtonElement).disabled).toBe(true);
		expect(onRenameProject).not.toHaveBeenCalled();
	});

	it("keeps the dialog open with the server message when the rename fails", async () => {
		const onRenameProject = vi.fn(async () => {
			throw new Error("Gagal mengganti nama project. Coba lagi.");
		});
		renderSidebar({ onRenameProject });

		fireEvent.click(await openActionsMenu());
		const input =
			await screen.findByLabelText<HTMLInputElement>("Nama project");
		fireEvent.change(input, { target: { value: "Aroma Operasional" } });
		fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Gagal mengganti nama project. Coba lagi.",
			),
		);
		expect(screen.getByRole("dialog")).toBeDefined();
		expect(screen.getByLabelText<HTMLInputElement>("Nama project").value).toBe(
			"Aroma Operasional",
		);
	});

	it("does not open the project, regenerate it, or change its identifier when renaming", async () => {
		const onRenameProject = vi.fn(async () => {});
		const onSelectProject = vi.fn();
		const onDuplicateProject = vi.fn(async () => {});
		renderSidebar({ onRenameProject, onSelectProject, onDuplicateProject });

		fireEvent.click(await openActionsMenu());
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		fireEvent.click(await openActionsMenu());
		const input =
			await screen.findByLabelText<HTMLInputElement>("Nama project");
		fireEvent.change(input, { target: { value: "Aroma Operasional" } });
		fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

		await waitFor(() => expect(onRenameProject).toHaveBeenCalledTimes(1));
		expect(onRenameProject).toHaveBeenCalledWith("p1", "Aroma Operasional");
		expect(onSelectProject).not.toHaveBeenCalled();
		expect(onDuplicateProject).not.toHaveBeenCalled();
	});

	it("duplicates a project from the history menu and stays on the list", async () => {
		const onDuplicateProject = vi.fn(async () => {});
		const onSelectProject = vi.fn();
		renderSidebar({ onDuplicateProject, onSelectProject });

		await openActionsMenu();
		fireEvent.click(
			screen.getByRole("menuitem", { name: /Duplikat project/i }),
		);

		await waitFor(() => expect(onDuplicateProject).toHaveBeenCalledWith("p1"));
		expect(onSelectProject).not.toHaveBeenCalled();
	});

	it("closes the rename dialog when the project leaves the list", async () => {
		const props = {
			onSelectProject: vi.fn(),
			onDeleteProject: vi.fn(async () => {}),
			onRenameProject: vi.fn(async () => {}),
			onDuplicateProject: vi.fn(async () => {}),
		};
		const view = render(<StudioSidebar history={[project]} {...props} />);

		fireEvent.click(await openActionsMenu());
		await screen.findByRole("dialog");

		view.rerender(<StudioSidebar history={[]} {...props} />);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("keeps the dialog name from being replaced by a stale title prop", async () => {
		const onRename = vi.fn(async () => {});
		const view = render(
			<StudioRenameProjectDialog
				open
				onOpenChange={() => {}}
				name="Aroma Control"
				onRename={onRename}
			/>,
		);
		const input =
			await screen.findByLabelText<HTMLInputElement>("Nama project");
		fireEvent.change(input, { target: { value: "Aroma Operasional" } });

		view.rerender(
			<StudioRenameProjectDialog
				open
				onOpenChange={() => {}}
				name="Aroma Control"
				onRename={onRename}
			/>,
		);

		expect(screen.getByLabelText<HTMLInputElement>("Nama project").value).toBe(
			"Aroma Operasional",
		);
	});
});
