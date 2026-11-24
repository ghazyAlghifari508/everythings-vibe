// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioHeader } from "@/features/studio/components/workspace/studio-header";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: null }),
	},
}));

describe("StudioHeader", () => {
	afterEach(() => cleanup());

	function renderHeader(overrides: Record<string, unknown> = {}) {
		return render(
			<StudioHeader
				title="KopiKultur Coffee Shop App"
				duplicating={false}
				exporting={false}
				canExport
				onDuplicate={vi.fn()}
				onRename={async () => {}}
				onExport={vi.fn()}
				{...overrides}
			/>,
		);
	}

	it("opens the export menu without exposing project actions", async () => {
		renderHeader();
		fireEvent.pointerDown(
			screen.getByRole("button", { name: "Export project" }),
			{ button: 0, ctrlKey: false, pointerType: "mouse" },
		);
		expect(
			await screen.findByRole("menuitem", { name: "Download ZIP" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("menuitem", { name: /Duplicate Project/i }),
		).toBeNull();
	});

	it("keeps project menu, title, export and account controls reachable", () => {
		renderHeader({ onDelete: vi.fn() });
		expect(screen.getByRole("button", { name: "Menu project" })).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Export project" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Profil dan tampilan" }),
		).toBeDefined();
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
			"KopiKultur Coffee Shop App",
		);
	});

	it("has no manual add-page or project design-system action in the project dropdown", async () => {
		renderHeader({ onDelete: vi.fn() });
		fireEvent.pointerDown(
			screen.getByRole("button", { name: "Menu project" }),
			{ button: 0, ctrlKey: false, pointerType: "mouse" },
		);
		expect(
			await screen.findByRole("menuitem", {
				name: /Kembali ke Semua Project/i,
			}),
		).toBeDefined();
		expect(
			screen.getByRole("menuitem", { name: /Duplicate Project/i }),
		).toBeDefined();
		expect(
			screen.getByRole("menuitem", { name: /Hapus project/i }),
		).toBeDefined();
		expect(
			screen.queryByRole("menuitem", { name: /Tambah Halaman/i }),
		).toBeNull();
		expect(
			screen.queryByRole("menuitem", { name: /Design system/i }),
		).toBeNull();
	});

	it("renames the project through the project menu dialog", async () => {
		const onRename = vi.fn(async () => {});
		renderHeader({ onRename });
		fireEvent.pointerDown(
			screen.getByRole("button", { name: "Menu project" }),
			{ button: 0, ctrlKey: false, pointerType: "mouse" },
		);
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Ganti nama project/i }),
		);

		const input =
			await screen.findByLabelText<HTMLInputElement>("Nama project");
		expect(input.value).toBe("KopiKultur Coffee Shop App");
		fireEvent.change(input, { target: { value: "KopiKultur POS" } });
		fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

		await waitFor(() =>
			expect(onRename).toHaveBeenCalledWith("KopiKultur POS"),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("opens the project menu from the keyboard", async () => {
		renderHeader();
		const trigger = screen.getByRole("button", { name: "Menu project" });
		trigger.focus();
		fireEvent.keyDown(trigger, { key: "Enter" });
		expect(
			await screen.findByRole("menuitem", { name: /Duplicate Project/i }),
		).toBeTruthy();
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
	});

	it("surfaces the exporting state on the export control", () => {
		renderHeader({ exporting: true });
		const exportButton = screen.getByRole("button", {
			name: "Export project",
		});
		expect(exportButton.querySelector("svg")).not.toBeNull();
	});
});
