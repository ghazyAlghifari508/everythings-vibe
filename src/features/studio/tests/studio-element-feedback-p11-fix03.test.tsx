// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioElementFeedback } from "../components/workspace/studio-element-feedback";
import { StudioHeader } from "../components/workspace/studio-header";
import type { StudioElementEditing } from "../hooks/use-studio-element-editing";
import type { StudioElementPreview } from "../types/studio-element";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, ...props }: React.ComponentProps<"a"> & { to: string }) => (
		<a href={to} {...props} />
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

const hash = "a".repeat(64);
const applied: StudioElementPreview = {
	id: "12345678-1234-4234-8234-123456789abc",
	frameId: "home",
	frameName: "Home",
	baseRevision: 1,
	baseHash: hash,
	target: {
		projectId: "project",
		frameId: "home",
		baseRevision: 1,
		baseHash: hash,
		elementId: "title",
		selector: "#title",
		tag: "h1",
		role: null,
		label: "Welcome",
		signature: hash,
		parentId: null,
		bounds: { x: 0, y: 0, width: 10, height: 10 },
	},
	status: "applied",
	before: "Welcome",
	after: "Hello",
	summary: "Teks diperbarui",
	appliedRevision: 2,
};

function editing(
	overrides: Partial<StudioElementEditing> = {},
): StudioElementEditing {
	return {
		target: null,
		pending: null,
		undo: applied,
		busy: false,
		error: "",
		selectTarget: vi.fn(),
		clearTarget: vi.fn(),
		submit: async () => ({ accepted: true }),
		transition: async () => {},
		refresh: async () => {},
		...overrides,
	};
}

function advance(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

const dismissName = "Tutup notifikasi";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("Pencil operation feedback", () => {
	it("announces a new operation, but never persisted history alone", () => {
		const { rerender } = render(<StudioElementFeedback editing={editing()} />);
		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
		expect(screen.getByRole("status").textContent).toBe("");

		rerender(
			<StudioElementFeedback
				editing={editing({ notice: { row: applied, kind: "text" } })}
			/>,
		);
		expect(screen.getByRole("status").textContent).toBe("Teks diperbarui");
		expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
	});

	it("dismisses one operation without hiding the next operation", () => {
		const { rerender } = render(
			<StudioElementFeedback
				editing={editing({ notice: { row: applied, kind: "text" } })}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: dismissName }));
		expect(screen.queryByRole("button", { name: dismissName })).toBeNull();
		rerender(
			<StudioElementFeedback
				editing={editing({ notice: { row: { ...applied }, kind: "text" } })}
			/>,
		);
		expect(screen.queryByRole("button", { name: dismissName })).toBeNull();

		const next = { ...applied, id: "12345678-1234-4234-8234-123456789abd" };
		rerender(
			<StudioElementFeedback
				editing={editing({ notice: { row: next, kind: "delete" }, undo: next })}
			/>,
		);
		expect(screen.getByRole("status").textContent).toBe("Elemen dihapus");
	});

	it("expires after the remaining time, pausing during pointer and keyboard interaction", () => {
		vi.useFakeTimers();
		render(
			<StudioElementFeedback
				editing={editing({ notice: { row: applied, kind: "ai" } })}
			/>,
		);
		const undo = screen.getByRole("button", { name: "Undo" });
		const dismiss = screen.getByRole("button", { name: dismissName });
		advance(2000);
		fireEvent.pointerOver(undo, { pointerType: "mouse" });
		advance(7000);
		expect(screen.getByRole("button", { name: "Undo" })).toBe(undo);
		act(() => dismiss.focus());
		fireEvent.pointerOut(undo, { pointerType: "mouse" });
		advance(7000);
		expect(screen.getByRole("button", { name: dismissName })).toBe(dismiss);
		act(() => dismiss.blur());
		advance(3999);
		expect(screen.getByRole("button", { name: dismissName })).toBe(dismiss);
		advance(1);
		expect(screen.queryByRole("button", { name: dismissName })).toBeNull();
	});

	it("keeps an undoable revision in the project menu after the notice is dismissed", async () => {
		const transition = vi.fn(async () => {});
		render(
			<StudioHeader
				title="Project"
				duplicating={false}
				exporting={false}
				canExport
				onDuplicate={vi.fn()}
				onRename={async () => {}}
				onExport={vi.fn()}
				elementEditing={editing({
					notice: { row: applied, kind: "text" },
					transition,
				})}
			/>,
		);
		const dismiss = screen.getByRole("button", { name: dismissName });
		act(() => dismiss.focus());
		fireEvent.click(dismiss);
		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
		const projectMenu = screen.getByRole("button", { name: "Menu project" });
		expect(document.activeElement).toBe(projectMenu);
		fireEvent.keyDown(projectMenu, { key: "Enter" });
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Undo revisi elemen/i }),
		);
		expect(transition).toHaveBeenCalledExactlyOnceWith(applied, "undo");
	});

	it("only undoes the revision that matches the notice and remains current", () => {
		const transition = vi.fn(async () => {});
		const notice = {
			row: applied,
			kind: "text",
		} satisfies NonNullable<StudioElementEditing["notice"]>;
		const { rerender } = render(
			<StudioElementFeedback
				editing={editing({ notice, undo: null, transition })}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
		rerender(
			<StudioElementFeedback editing={editing({ notice, transition })} />,
		);
		fireEvent.click(screen.getByRole("button", { name: "Undo" }));
		expect(transition).toHaveBeenCalledExactlyOnceWith(applied, "undo");
	});

	it("does not suppress a fresh edit when a legacy candidate needs a decision", () => {
		const pending: StudioElementPreview = {
			...applied,
			id: "12345678-1234-4234-8234-123456789abe",
			status: "preview",
			summary: "Perbarui navigasi",
			appliedRevision: null,
		};
		render(
			<StudioElementFeedback
				editing={editing({ pending, notice: { row: applied, kind: "text" } })}
			/>,
		);
		expect(screen.getByRole("button", { name: "Terapkan" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
	});

	it("shows a failure instead of retaining the last success", () => {
		render(
			<StudioElementFeedback
				editing={editing({
					notice: { row: applied, kind: "text" },
					error: "Versi layar berubah.",
				})}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toBe("Versi layar berubah.");
		expect(screen.getByRole("status").textContent).toBe("");
		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
	});

	it.each([
		"apply",
		"cancel",
	] as const)("keeps legacy candidates pending until explicit %s, with failures as alerts", (action) => {
		const transition = vi.fn(async () => {});
		vi.useFakeTimers();
		const pending: StudioElementPreview = {
			...applied,
			status: "preview",
			appliedRevision: null,
		};
		render(
			<StudioElementFeedback
				editing={editing({
					pending,
					transition,
					error: "Tidak dapat menyimpan revisi.",
				})}
			/>,
		);
		advance(10_000);
		expect(transition).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Tidak dapat menyimpan revisi.",
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: action === "apply" ? "Terapkan" : "Batalkan",
			}),
		);
		expect(transition).toHaveBeenCalledExactlyOnceWith(pending, action);
	});
});
