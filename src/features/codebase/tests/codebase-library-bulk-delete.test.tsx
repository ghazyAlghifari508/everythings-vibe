// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseLibraryView } from "@/features/codebase/components/planning/codebase-library-view";
import {
	readPlanCodebasePointer,
	storePlanCodebasePointer,
} from "@/features/codebase/services/plan-storage";
import {
	enterSelectionMode,
	installRadixDomPolyfills,
	makeItem,
	mockCodebaseBulkApi,
	readBulkDeleteCalls,
} from "@/features/codebase/tests/codebase-library-selection-fixture";
import { CODEBASE_LIBRARY_PAGE_SIZE } from "@/features/codebase/types/codebase-constants";
import { useUIStore } from "@/store";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: (props: {
		children: React.ReactNode;
		to: string;
		className?: string;
		onClick?: () => void;
	}) => (
		<a href={props.to} className={props.className} onClick={props.onClick}>
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

describe("CodebaseLibraryView bulk deletion", () => {
	it("deletes only the selected owned repositories after confirmation", async () => {
		storePlanCodebasePointer("cb-1", "Repo 1");
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
			screen.getByRole("checkbox", { name: /Pilih repository Repo 3/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus Terpilih" }));

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Hapus 2 repository?")).toBeDefined();
		expect(
			within(dialog).getByText(
				"Repository dan planning terkait akan dihapus permanen.",
			),
		).toBeDefined();

		fireEvent.click(within(dialog).getByRole("button", { name: "Hapus 2" }));

		await waitFor(() => {
			expect(readBulkDeleteCalls()).toEqual([["cb-1", "cb-3"]]);
		});
		await waitFor(() => {
			expect(screen.queryByText("Repo 1")).toBeNull();
		});
		expect(screen.queryByText("Repo 3")).toBeNull();
		expect(screen.getByText("Repo 2")).toBeDefined();
		expect(readPlanCodebasePointer()).toBeNull();
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
		expect(useUIStore.getState().toastMessage).toBe("2 repository dihapus.");
	});

	it("removes the whole history through select-all plus delete", async () => {
		render(
			<CodebaseLibraryView
				items={[makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")]}
			/>,
		);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus Terpilih" }));

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Hapus 2 repository?")).toBeDefined();
		fireEvent.click(within(dialog).getByRole("button", { name: "Hapus 2" }));

		await waitFor(() => {
			expect(readBulkDeleteCalls()).toEqual([["cb-1", "cb-2"]]);
		});
		await waitFor(() => {
			expect(screen.getByText("Belum ada repository terhubung")).toBeDefined();
		});
	});

	it("clamps pagination after a bulk delete shrinks the page count", async () => {
		const items = Array.from(
			{ length: CODEBASE_LIBRARY_PAGE_SIZE * 2 + 1 },
			(_, i) => makeItem(`cb-${i + 1}`, `Project ${i + 1}`),
		);
		render(<CodebaseLibraryView items={items} />);

		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(screen.getByText(`Halaman 3 dari 3`)).toBeDefined();

		enterSelectionMode();
		fireEvent.click(screen.getByRole("button", { name: "Hapus Terpilih" }));
		fireEvent.click(
			within(screen.getByRole("dialog")).getByRole("button", {
				name: "Hapus 1",
			}),
		);

		await waitFor(() => {
			expect(screen.getByText("Halaman 2 dari 2")).toBeDefined();
		});
	});

	it("keeps the rows the server did not confirm and reports the split honestly", async () => {
		mockCodebaseBulkApi((ids) => ({
			deleted: 1,
			skipped: 1,
			deletedIds: [ids[0]],
		}));
		render(
			<CodebaseLibraryView
				items={[makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")]}
			/>,
		);

		enterSelectionMode();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 2/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus Terpilih" }));
		fireEvent.click(
			within(screen.getByRole("dialog")).getByRole("button", {
				name: "Hapus 2",
			}),
		);

		await waitFor(() => {
			expect(screen.getByText("1 repository dipilih")).toBeDefined();
		});
		expect(screen.getByText("Repo 2")).toBeDefined();
	});
});
