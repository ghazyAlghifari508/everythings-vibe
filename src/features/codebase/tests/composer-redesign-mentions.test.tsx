// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComposerSubmissionPayload } from "@/features/codebase/services/composer-interactions";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import type { ComposerReferenceBinding } from "../types/revision";

afterEach(cleanup);

const prdArtifact = {
	id: "prd-proj-1",
	title: "PRD · Pencarian Artikel",
	fileName: "PRD-pencarian-artikel.md",
	fileSizeBytes: 2048,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const featureArtifact = {
	id: "feature-proj-1",
	title: "Spesifikasi Fitur · Pencarian Artikel",
	fileName: "feature-pencarian-artikel.json",
	fileSizeBytes: 1024,
	badge: "FITUR",
	description: "Dokumen siap",
};

const repoFiles = [
	{ path: "src/pages/Content.jsx" },
	{ path: "package.json" },
	{ path: "README.md" },
];

describe("Phase 07 Composer Redesign — @ Mentions, Slash Commands & Project Isolation", () => {
	it("5 & 6. opens @ mention popover, filters documents/files, creates structured bindings, and detects stale snapshot files", () => {
		const onReferencesChange = vi.fn();
		let latestPayload: ComposerSubmissionPayload | null = null;
		const { rerender } = render(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-1"
				composerMode="revise"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact]}
				repositoryFiles={repoFiles}
				onReferencesChange={onReferencesChange}
				onSubmitComposer={(payload) => {
					latestPayload = payload;
					return true;
				}}
			/>,
		);

		const composer = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(composer, {
			target: { value: "Sesuaikan komponen @Content" },
		});

		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		fireEvent.click(
			screen.getByTestId("composer-mention-file-src/pages/Content.jsx"),
		);

		expect(composer.value).toBe("Sesuaikan komponen ");
		expect(onReferencesChange).toHaveBeenLastCalledWith([
			{
				kind: "file",
				id: "file:snap-1:src/pages/Content.jsx",
				path: "src/pages/Content.jsx",
				codebaseId: "repo-1",
				snapshotId: "snap-1",
			} satisfies ComposerReferenceBinding,
		]);

		const chip = screen.getByTestId(
			"composer-reference-chip-src/pages/Content.jsx",
		);
		expect(chip.textContent).toContain("@src/pages/Content.jsx");

		rerender(
			<CodebaseChatWorkspace
				featureName="Pencarian Artikel"
				projectId="proj-1"
				codebaseId="repo-1"
				currentSnapshotId="snap-2"
				composerMode="revise"
				messages={[{ id: "m1", role: "user", content: "Halo" }]}
				questions={[]}
				answers={{}}
				artifacts={[featureArtifact, prdArtifact]}
				repositoryFiles={[{ path: "package.json" }]}
				onReferencesChange={onReferencesChange}
				onSubmitComposer={(payload) => {
					latestPayload = payload;
					return true;
				}}
			/>,
		);

		const staleChip = screen.getByTestId(
			"composer-reference-chip-src/pages/Content.jsx",
		);
		expect(staleChip.getAttribute("data-stale")).toBe("true");
		expect(staleChip.textContent).toContain("Tidak ada di snapshot aktif");
		expect(
			(screen.getByTestId("prompt-bar-submit") as HTMLButtonElement).disabled,
		).toBe(true);

		fireEvent.click(
			screen.getByTestId("composer-reference-remove-src/pages/Content.jsx"),
		);
		expect(
			screen.queryByTestId("composer-reference-chip-src/pages/Content.jsx"),
		).toBeNull();
		expect(
			(screen.getByTestId("prompt-bar-submit") as HTMLButtonElement).disabled,
		).toBe(false);

		fireEvent.click(screen.getByTestId("prompt-bar-submit"));
		expect(latestPayload).toMatchObject({
			mode: "revise",
			targetKind: "prd",
			optionalReferences: [],
		});
	});

	it("8 & 9. executes /plan, /revise, and /help slash commands without sending them as plain text to the model, and respects locked planning state", () => {
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
		expect(screen.getByTestId("composer-slash-item-plan")).toBeTruthy();
		expect(screen.getByTestId("composer-slash-item-revise")).toBeTruthy();
		expect(screen.getByTestId("composer-slash-item-help")).toBeTruthy();

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

	it("14 & 15. isolates draft and references when switching projects and handles keyboard navigation and IME composition", () => {
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
				artifacts={[prdArtifact]}
				repositoryFiles={repoFiles}
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
				repositoryFiles={repoFiles}
				onSendMessage={onSendMessage}
			/>,
		);

		expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
		expect(screen.queryByTestId("composer-reference-chips")).toBeNull();
	});
});
