// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseLibraryView } from "@/features/codebase/components/planning/codebase-library-view";
import { readPlanCodebasePointer } from "@/features/codebase/services/plan-storage";
import {
	enterSelectionMode,
	installRadixDomPolyfills,
	makeItem,
	mockCodebaseBulkApi,
	openActionsMenu,
} from "@/features/codebase/tests/codebase-library-selection-fixture";
import { CODEBASE_LIBRARY_PAGE_SIZE } from "@/features/codebase/types/codebase-constants";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: (props: {
		children: React.ReactNode;
		to: string;
		params?: { id: string };
		className?: string;
		onClick?: () => void;
	}) => (
		<a
			href={props.params ? props.to.replace("$id", props.params.id) : props.to}
			className={props.className}
			onClick={props.onClick}
		>
			{props.children}
		</a>
	),
}));

beforeEach(() => {
	installRadixDomPolyfills();
	mockCodebaseBulkApi();
	sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	sessionStorage.clear();
});

function makeProjects(count: number) {
	return Array.from({ length: count }, (_, i) =>
		makeItem(`cb-${i + 1}`, `Project ${i + 1}`),
	);
}

describe("CodebaseLibraryView default history", () => {
	it("renders no checkbox, no select-all and no permanent delete-all action", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem("cb-1", "Ghazy Portofolio"),
					makeItem("cb-2", "Ocean Guard"),
				]}
			/>,
		);

		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
		expect(screen.queryByText(/Pilih semua/i)).toBeNull();
		expect(screen.queryByRole("button", { name: /^Hapus semua$/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Batalkan Pilihan/i }),
		).toBeNull();
		expect(
			screen.getByText("Ghazy Portofolio").closest("a")?.getAttribute("href"),
		).toBe("/codebases/cb-1");
	});

	it("offers Pick on the row menu without leaving the page", () => {
		render(
			<CodebaseLibraryView items={[makeItem("cb-1", "Ghazy Portofolio")]} />,
		);

		openActionsMenu();
		const labels = screen.getAllByRole("menuitem").map((el) => el.textContent);
		expect(labels).toEqual(["Ganti nama", "Pilih", "Hapus project"]);
		expect(readPlanCodebasePointer()).toBeNull();

		fireEvent.click(screen.getByRole("menuitem", { name: /^Pilih$/i }));
		expect(readPlanCodebasePointer()).toBeNull();
	});
});

describe("CodebaseLibraryView selection mode", () => {
	it("selects the chosen row and reveals the selection chrome", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem("cb-1", "Ghazy Portofolio"),
					makeItem("cb-2", "Ocean Guard"),
				]}
			/>,
		);

		enterSelectionMode(1);

		const ocean = screen.getByRole("checkbox", {
			name: /Pilih repository Ocean Guard/i,
		}) as HTMLInputElement;
		const ghazy = screen.getByRole("checkbox", {
			name: /Pilih repository Ghazy Portofolio/i,
		}) as HTMLInputElement;
		expect(ocean.checked).toBe(true);
		expect(ghazy.checked).toBe(false);
		expect(screen.getByText("1 repository dipilih")).toBeDefined();
		expect(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Batalkan Pilihan" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Hapus Terpilih" }),
		).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Opsi repository/i }),
		).toBeNull();
	});

	it("toggles rows through checkbox and row clicks without navigating", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem("cb-1", "Repo 1"),
					makeItem("cb-2", "Repo 2"),
					makeItem("cb-3", "Repo 3"),
				]}
			/>,
		);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 2/i }),
		);
		expect(screen.getByText("2 repository dipilih")).toBeDefined();

		fireEvent.click(screen.getByText("Repo 3").closest("button") as Element);
		expect(screen.getByText("3 repository dipilih")).toBeDefined();

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);
		expect(screen.getByText("2 repository dipilih")).toBeDefined();
		expect(readPlanCodebasePointer()).toBeNull();
	});

	it("returns to normal mode when the last selection is cleared", () => {
		render(<CodebaseLibraryView items={[makeItem("cb-1", "Repo 1")]} />);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);

		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
		expect(screen.queryByText(/repository dipilih/i)).toBeNull();
		expect(
			screen.getByRole("button", { name: /Opsi repository/i }),
		).toBeDefined();
	});

	it("clears the whole selection through Batalkan Pilihan", () => {
		render(
			<CodebaseLibraryView
				items={[makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")]}
			/>,
		);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 2/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Batalkan Pilihan" }));

		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
		expect(screen.queryByText(/repository dipilih/i)).toBeNull();
	});

	it("keeps the page checkbox empty while only some rows are selected", () => {
		render(
			<CodebaseLibraryView
				items={[makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")]}
			/>,
		);

		enterSelectionMode();

		const pageCheckbox = screen.getByRole("checkbox", {
			name: /Pilih semua/i,
		}) as HTMLInputElement;
		expect(pageCheckbox.checked).toBe(false);
		expect(pageCheckbox.indeterminate).toBe(false);
		expect(pageCheckbox.getAttribute("aria-checked")).toBe("false");
		expect(screen.getByText("Pilih semua di halaman ini")).toBeDefined();

		fireEvent.click(pageCheckbox);
		expect(screen.getByText("2 repository dipilih")).toBeDefined();
		expect(pageCheckbox.checked).toBe(true);
		expect(pageCheckbox.indeterminate).toBe(false);
		expect(pageCheckbox.getAttribute("aria-checked")).toBe("true");
		expect(
			screen.getByText("Semua repository di halaman ini dipilih"),
		).toBeDefined();
	});

	it("selects the current page only and drops the selection when the page changes", () => {
		const items = makeProjects(CODEBASE_LIBRARY_PAGE_SIZE * 2);
		render(<CodebaseLibraryView items={items} />);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);

		expect(
			screen.getByText(`${CODEBASE_LIBRARY_PAGE_SIZE} repository dipilih`),
		).toBeDefined();
		expect(screen.queryByRole("button", { name: /sesuai filter/i })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(screen.getByText("Halaman 2 dari 2")).toBeDefined();
		expect(screen.queryByText(/repository dipilih/i)).toBeNull();
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
	});

	it("renders the selection bar between the repository list and pagination", () => {
		render(
			<CodebaseLibraryView
				items={makeProjects(CODEBASE_LIBRARY_PAGE_SIZE + 1)}
			/>,
		);

		enterSelectionMode();

		const list = screen.getByTestId("codebase-library-list");
		const bar = screen.getByText("1 repository dipilih");
		const pagination = screen.getByRole("navigation", { name: "Pagination" });

		expect(
			list.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			bar.compareDocumentPosition(pagination) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("clears the selection when the search changes", () => {
		render(<CodebaseLibraryView items={makeProjects(3)} />);

		enterSelectionMode();
		expect(screen.getByText("1 repository dipilih")).toBeDefined();

		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "Project 1" },
		});

		expect(screen.queryByText(/repository dipilih/i)).toBeNull();
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
	});
});
