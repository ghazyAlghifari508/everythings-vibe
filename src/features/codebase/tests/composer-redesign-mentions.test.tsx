// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ComposerSubmissionPayload } from "@/features/codebase/services/composer-interactions";
import { reconcileSelectedReferences } from "@/features/codebase/services/composer-interactions";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import type { ComposerReferenceBinding } from "../types/revision";

beforeAll(() => {
	// Radix Popper measures the anchor element; jsdom ships no ResizeObserver.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const featureArtifact = {
	id: "feature-proj-1",
	title: "Spesifikasi Fitur · Pencarian Artikel",
	fileName: "feature-pencarian-artikel.json",
	fileSizeBytes: 1024,
	badge: "FITUR",
	description: "Dokumen siap",
};

const prdArtifact = {
	id: "prd-proj-1",
	title: "PRD · Pencarian Artikel",
	fileName: "PRD-pencarian-artikel.md",
	fileSizeBytes: 2048,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const acArtifact = {
	id: "ac-proj-1",
	title: "Acceptance Criteria · Pencarian Artikel",
	fileName: "AC-pencarian-artikel.md",
	fileSizeBytes: 1536,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const tasksArtifact = {
	id: "tasks-proj-1",
	title: "Task · Pencarian Artikel",
	fileName: "tasks-pencarian-artikel.json",
	fileSizeBytes: 512,
	badge: "TASK",
	description: "Dokumen siap",
};

const repositoryFiles = [
	{ path: "src/pages/Content.jsx" },
	{ path: "package.json" },
];

describe("FIX 06 — @ references only real planning documents", () => {
	it("lists the active feature's existing documents and no repository files", () => {
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact]}
				repositoryFiles={repositoryFiles}
			/>,
		);

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		expect(screen.getByTestId("composer-mention-doc-feature")).toBeTruthy();
		expect(screen.getByTestId("composer-mention-doc-prd")).toBeTruthy();
		expect(screen.queryByTestId("composer-mention-doc-ac")).toBeNull();
		expect(screen.queryByTestId("composer-mention-doc-tasks")).toBeNull();

		expect(screen.queryByTestId("composer-mention-files-group")).toBeNull();
		expect(screen.queryByText("File Repository")).toBeNull();
		expect(screen.queryByText("Belum dibuat")).toBeNull();
		expect(screen.queryByText("@src/pages/Content.jsx")).toBeNull();
		expect(screen.getByPlaceholderText("Cari dokumen...")).toBeTruthy();
	});

	it("offers nothing when the feature has no persisted planning document", () => {
		render(
			<CodebaseChatWorkspace
				featureName="Fitur Baru"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[]}
				repositoryFiles={repositoryFiles}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, { target: { value: "Buat @PRD" } });

		// Typing `@` with nothing referenceable never fabricates a menu.
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();
		expect(composer.value).toBe("Buat @PRD");

		// An explicit click still explains the empty state without a fake list.
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		expect(screen.getByText("Belum ada dokumen planning")).toBeTruthy();
		expect(screen.getByText(/Dokumen akan tersedia setelah/)).toBeTruthy();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("never offers documents that belong to another feature", () => {
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[
					{ ...prdArtifact, id: "prd-proj-2", title: "PRD · Fitur Lain" },
					{ ...acArtifact, id: "ac-proj-2", title: "AC · Fitur Lain" },
				]}
			/>,
		);

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(screen.getByText("Belum ada dokumen planning")).toBeTruthy();
		expect(screen.getByText(/Dokumen akan tersedia setelah/)).toBeTruthy();
	});

	it("filters by search and shows only matching documents", () => {
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact, acArtifact, tasksArtifact]}
			/>,
		);

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		expect(screen.getAllByRole("option")).toHaveLength(4);

		const search = screen.getByTestId(
			"composer-mention-search",
		) as HTMLInputElement;
		fireEvent.change(search, { target: { value: "accept" } });

		expect(screen.getAllByRole("option")).toHaveLength(1);
		expect(screen.getByTestId("composer-mention-doc-ac")).toBeTruthy();
	});

	it("records the real artifact identity when a document is clicked", () => {
		const onReferencesChange = vi.fn();
		const onSendMessage = vi.fn();
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact]}
				onReferencesChange={onReferencesChange}
				onSendMessage={onSendMessage}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, {
			target: { value: "Tambahkan indeks pencarian penuh" },
		});
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		fireEvent.click(screen.getByTestId("composer-mention-doc-prd"));

		expect(onReferencesChange).toHaveBeenLastCalledWith([
			{
				kind: "artifact",
				id: "prd-proj-1",
				projectId: "proj-1",
				targetKind: "prd",
				label: "@PRD · Pencarian Artikel",
				fileName: "PRD-pencarian-artikel.md",
			} satisfies ComposerReferenceBinding,
		]);
		// Selecting a document never sends the message and never rewrites prose.
		expect(onSendMessage).not.toHaveBeenCalled();
		expect(composer.value).toBe("Tambahkan indeks pencarian penuh");
		expect(
			screen.getByTestId("composer-reference-chip-prd").textContent,
		).toContain("@PRD · Pencarian Artikel");
	});

	it("does not duplicate a reference when the same document is picked twice", () => {
		const onReferencesChange = vi.fn();
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				onReferencesChange={onReferencesChange}
			/>,
		);

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		fireEvent.click(screen.getByTestId("composer-mention-doc-prd"));
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		fireEvent.click(screen.getByTestId("composer-mention-doc-prd"));

		const calls = onReferencesChange.mock.calls;
		const lastCall = calls[calls.length - 1]?.[0];
		expect(lastCall).toHaveLength(1);
		expect(screen.getAllByTestId("composer-reference-chip-prd")).toHaveLength(
			1,
		);
	});

	it("supports keyboard selection from the textarea without losing the draft", () => {
		const onSendMessage = vi.fn();
		const onReferencesChange = vi.fn();
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact]}
				onSendMessage={onSendMessage}
				onReferencesChange={onReferencesChange}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, { target: { value: "Tolong cek @PR" } });
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		// The inline token filters as the user types, without stealing the caret.
		expect(screen.getByTestId("composer-mention-doc-prd")).toBeTruthy();
		expect(screen.queryByTestId("composer-mention-doc-feature")).toBeNull();

		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });

		expect(onSendMessage).not.toHaveBeenCalled();
		expect(onReferencesChange).toHaveBeenLastCalledWith([
			expect.objectContaining({ kind: "artifact", targetKind: "prd" }),
		]);
		expect(composer.value).toBe("Tolong cek ");
		expect(document.activeElement).toBe(composer);
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();
	});

	it("closes on Escape and on an outside click", async () => {
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, { target: { value: "@" } });
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		fireEvent.keyDown(composer, { key: "Escape", code: "Escape" });
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		// Radix attaches its outside-pointer listener on the next tick.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		fireEvent.pointerDown(document.body, { button: 0 });
		fireEvent.click(document.body);
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();
	});

	it("keeps the trigger usable while the selector is open", () => {
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
			/>,
		);

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		fireEvent.pointerDown(screen.getByTestId("composer-mention-trigger"), {
			button: 0,
		});
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();
	});

	it("resolves the revised document from the selected mention in Revise mode", () => {
		const captured: { payload: ComposerSubmissionPayload | null } = {
			payload: null,
		};
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				composerMode="revise"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact, acArtifact]}
				onSubmitComposer={(payload) => {
					captured.payload = payload;
					return true;
				}}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, {
			target: { value: "Tolong perbaiki cakupan pencarian" },
		});
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		fireEvent.click(screen.getByTestId("composer-mention-doc-ac"));
		fireEvent.click(screen.getByTestId("prompt-bar-submit"));

		expect(captured.payload).toMatchObject({
			mode: "revise",
			targetKind: "ac",
		});
		expect(captured.payload?.referenceBindings).toEqual([
			expect.objectContaining({ kind: "artifact", targetKind: "ac" }),
		]);
	});

	it("keeps Plan mode submission untouched", () => {
		const captured: { payload: ComposerSubmissionPayload | null } = {
			payload: null,
		};
		render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				onSubmitComposer={(payload) => {
					captured.payload = payload;
					return true;
				}}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, { target: { value: "Tambah filter lanjutan" } });
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		fireEvent.click(screen.getByTestId("composer-mention-doc-prd"));
		fireEvent.click(screen.getByTestId("prompt-bar-submit"));

		expect(captured.payload).toMatchObject({ mode: "plan" });
		expect(captured.payload?.targetKind).toBeUndefined();
		expect(captured.payload?.referenceBindings).toEqual([
			expect.objectContaining({ kind: "artifact", targetKind: "prd" }),
		]);
	});

	it("keeps legacy repository file references renderable but stale", () => {
		const [legacy] = reconcileSelectedReferences({
			references: [
				{
					kind: "file",
					id: "file:snap-1:src/pages/Content.jsx",
					path: "src/pages/Content.jsx",
					codebaseId: "repo-1",
					snapshotId: "snap-1",
				},
			],
			artifacts: [],
			repositoryFiles: [],
			activeCodebaseId: "repo-1",
			activeSnapshotId: "snap-2",
		});

		expect(legacy.chipLabel).toBe("@src/pages/Content.jsx");
		expect(legacy.available).toBe(false);
		expect(legacy.staleReason).toBe("Tidak ada di snapshot aktif");
	});
});

describe("Composer slash commands", () => {
	it("executes /plan, /revise, and /help without sending them as plain text", () => {
		const onSendMessage = vi.fn();
		const onSubmitComposer = vi.fn();
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				onSendMessage={onSendMessage}
				onSubmitComposer={onSubmitComposer}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, { target: { value: "/" } });
		expect(screen.getByTestId("composer-slash-menu")).toBeTruthy();

		fireEvent.click(screen.getByTestId("composer-slash-item-revise"));
		expect(
			screen.getByTestId("composer-mode-trigger").getAttribute("data-mode"),
		).toBe("revise");
		expect(composer.value).toBe("");
		expect(onSendMessage).not.toHaveBeenCalled();
		expect(onSubmitComposer).not.toHaveBeenCalled();

		fireEvent.change(composer, { target: { value: "/help" } });
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
		expect(screen.getByTestId("composer-command-help")).toBeTruthy();
		expect(composer.value).toBe("");
		expect(onSendMessage).not.toHaveBeenCalled();

		fireEvent.change(composer, { target: { value: "/plan" } });
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
		expect(
			screen.getByTestId("composer-mode-trigger").getAttribute("data-mode"),
		).toBe("plan");
		expect(onSendMessage).not.toHaveBeenCalled();

		rerender(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				stage="prd"
				answersReadOnly={true}
				composerMode="revise"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[prdArtifact]}
				onSendMessage={onSendMessage}
				onSubmitComposer={onSubmitComposer}
			/>,
		);

		fireEvent.change(composer, { target: { value: "/plan" } });
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
		expect(
			screen.getByTestId("composer-mode-trigger").getAttribute("data-mode"),
		).toBe("revise");
		expect(screen.getByTestId("composer-locked-notice")).toBeTruthy();
		expect(onSendMessage).not.toHaveBeenCalled();
	});
});

describe("Composer project isolation", () => {
	it("isolates draft and references when the active feature switches", () => {
		const onSendMessage = vi.fn();
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Fitur A"
				projectId="proj-a"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m1", role: "user", content: "A" }]}
				questions={[]}
				answers={{}}
				artifacts={[{ ...prdArtifact, id: "prd-proj-a" }]}
				onSendMessage={onSendMessage}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, { target: { value: "Draft milik proyek A @" } });
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();

		fireEvent.keyDown(composer, { key: "ArrowDown", code: "ArrowDown" });
		fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
		expect(onSendMessage).not.toHaveBeenCalled();
		expect(screen.getByTestId("composer-reference-chips")).toBeTruthy();

		fireEvent.keyDown(composer, {
			key: "Enter",
			code: "Enter",
			isComposing: true,
		});
		expect(onSendMessage).not.toHaveBeenCalled();

		rerender(
			<CodebaseChatWorkspace
				featureName="Fitur B"
				projectId="proj-b"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				messages={[{ id: "m2", role: "user", content: "B" }]}
				questions={[]}
				answers={{}}
				artifacts={[]}
				onSendMessage={onSendMessage}
			/>,
		);

		expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
		expect(screen.queryByTestId("composer-reference-chips")).toBeNull();
	});
});
