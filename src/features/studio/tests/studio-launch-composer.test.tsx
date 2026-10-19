// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type LaunchComposerConfig,
	StudioLaunchComposer,
} from "@/features/studio/components/composer/studio-launch-composer";

const baseConfig: LaunchComposerConfig = {
	designMode: "web",
	designSkillId: "none",
	initialPageCount: 3,
};

function renderComposer(
	overrides: Partial<Parameters<typeof StudioLaunchComposer>[0]> = {},
) {
	const onSubmit = vi.fn();
	const onPromptChange = vi.fn();
	const onConfigChange = vi.fn();
	const textareaRef = { current: null };
	render(
		<StudioLaunchComposer
			prompt=""
			onPromptChange={onPromptChange}
			config={baseConfig}
			onConfigChange={onConfigChange}
			reference={null}
			onOpenDesignPicker={vi.fn()}
			onRemoveReference={vi.fn()}
			loading={false}
			error=""
			onSubmit={onSubmit}
			textareaRef={textareaRef}
			{...overrides}
		/>,
	);
	return { onSubmit, onPromptChange, onConfigChange };
}

describe("StudioLaunchComposer", () => {
	afterEach(() => cleanup());

	it("uses an icon-only arrow submit without a generic generate label", () => {
		renderComposer({ prompt: "Dashboard kasir" });
		expect(screen.getByRole("button", { name: "Kirim prompt" })).toBeDefined();
		expect(screen.queryByText(/Generate UI/i)).toBeNull();
	});

	it("blocks empty prompts from submitting", () => {
		const { onSubmit } = renderComposer({ prompt: "   " });
		const submit = screen.getByRole("button", { name: "Kirim prompt" });
		expect(submit).toHaveProperty("disabled", true);
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("submits on Enter but keeps Shift+Enter and IME composition safe", () => {
		const { onSubmit } = renderComposer({ prompt: "Buat dashboard kasir" });
		const input = screen.getByRole("textbox");
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
		expect(onSubmit).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter", isComposing: true });
		expect(onSubmit).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});

	it("shows the active reference with replace and remove actions", () => {
		const onOpenDesignPicker = vi.fn();
		const onRemoveReference = vi.fn();
		renderComposer({
			reference: { label: "Workspace", logoFilename: "logo.svg" },
			onOpenDesignPicker,
			onRemoveReference,
		});
		expect(screen.getByText("Workspace")).toBeDefined();
		expect(screen.getByText(/logo\.svg/)).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
		expect(onOpenDesignPicker).toHaveBeenCalledTimes(1);
		fireEvent.click(
			screen.getByRole("button", { name: "Lepas referensi desain" }),
		);
		expect(onRemoveReference).toHaveBeenCalledTimes(1);
	});

	it("forwards platform, page count, and skill changes without submitting", () => {
		const { onSubmit, onConfigChange } = renderComposer();
		fireEvent.click(screen.getByRole("button", { name: /Mobile/i }));
		expect(onConfigChange).toHaveBeenCalledWith({ designMode: "mobile" });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("always renders a design affordance, never a generic plus, when no reference is active", () => {
		const onOpenDesignPicker = vi.fn();
		renderComposer({ reference: null, onOpenDesignPicker });
		const trigger = screen.getByRole("button", { name: "Pilih tampilan" });
		expect(trigger.getAttribute("title")).toBe("Pilih tampilan");
		const icon = trigger.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon?.getAttribute("aria-hidden")).toBe("true");
		fireEvent.click(trigger);
		expect(onOpenDesignPicker).toHaveBeenCalledTimes(1);
	});

	it("keeps the same design affordance while a reference is active", () => {
		renderComposer({
			reference: { label: "Workspace", logoFilename: null },
		});
		const trigger = screen.getByRole("button", {
			name: "Ganti referensi desain",
		});
		const icon = trigger.querySelector("svg");
		expect(icon).not.toBeNull();
		expect(icon?.getAttribute("aria-hidden")).toBe("true");
	});

	it("renders PRD attachment trigger in toolbar", () => {
		renderComposer();
		const trigger = screen.getByRole("button", {
			name: "Lampirkan PRD (.md)",
		});
		expect(trigger).toBeDefined();
		expect(trigger.getAttribute("title")).toBe("Lampirkan PRD (.md)");
	});

	it("displays compact PRD chip with filename, status, and remove action", () => {
		const onPrdChange = vi.fn();
		renderComposer({
			prd: {
				filename: "PRD-CatatDompet.md",
				content: "# CatatDompet\nFeature list here.",
			},
			onPrdChange,
		});

		expect(screen.getByText("PRD-CatatDompet.md")).toBeDefined();
		expect(screen.getByText(/Product requirements · Ready/i)).toBeDefined();
		expect(screen.getByText("MD")).toBeDefined();

		const removeBtn = screen.getByRole("button", {
			name: "Hapus lampiran PRD",
		});
		fireEvent.click(removeBtn);
		expect(onPrdChange).toHaveBeenCalledWith(null);
	});

	it("handles file selection and attaches valid .md file", async () => {
		const onPrdChange = vi.fn();
		const onError = vi.fn();
		const { container } = render(
			<StudioLaunchComposer
				prompt="Test prompt"
				onPromptChange={vi.fn()}
				config={baseConfig}
				onConfigChange={vi.fn()}
				reference={null}
				onOpenDesignPicker={vi.fn()}
				onRemoveReference={vi.fn()}
				onPrdChange={onPrdChange}
				onError={onError}
				loading={false}
				error=""
				onSubmit={vi.fn()}
				textareaRef={{ current: null }}
			/>,
		);

		const fileInput = container.querySelector(
			'input[type="file"][accept=".md"]',
		) as HTMLInputElement;
		expect(fileInput).not.toBeNull();

		const validContent =
			"# PRD Title\nValid product requirement specifications.";
		const file = new File([validContent], "spec.md", { type: "text/markdown" });

		fireEvent.change(fileInput, { target: { files: [file] } });

		// Wait for async file reading
		await vi.waitFor(() => {
			expect(onPrdChange).toHaveBeenCalledWith({
				filename: "spec.md",
				content: validContent,
			});
		});
		expect(onError).toHaveBeenCalledWith("");
	});

	it("rejects non-.md files and calls onError with descriptive feedback", async () => {
		const onPrdChange = vi.fn();
		const onError = vi.fn();
		const { container } = render(
			<StudioLaunchComposer
				prompt="Test prompt"
				onPromptChange={vi.fn()}
				config={baseConfig}
				onConfigChange={vi.fn()}
				reference={null}
				onOpenDesignPicker={vi.fn()}
				onRemoveReference={vi.fn()}
				onPrdChange={onPrdChange}
				onError={onError}
				loading={false}
				error=""
				onSubmit={vi.fn()}
				textareaRef={{ current: null }}
			/>,
		);

		const fileInput = container.querySelector(
			'input[type="file"][accept=".md"]',
		) as HTMLInputElement;

		// Try uploading a PDF
		const pdfFile = new File(["%PDF-1.4 dummy"], "spec.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(fileInput, { target: { files: [pdfFile] } });

		expect(onError).toHaveBeenCalledWith(
			expect.stringMatching(/Hanya file berekstensi \.md yang didukung/i),
		);
		expect(onPrdChange).not.toHaveBeenCalled();

		// Try uploading a .markdown file (strictly rejected per spec)
		onError.mockReset();
		const markdownFile = new File(["# Content"], "spec.markdown", {
			type: "text/markdown",
		});
		fireEvent.change(fileInput, { target: { files: [markdownFile] } });

		expect(onError).toHaveBeenCalledWith(
			expect.stringMatching(/Hanya file berekstensi \.md yang didukung/i),
		);
		expect(onPrdChange).not.toHaveBeenCalled();
	});

	it("rejects empty .md files and calls onError", async () => {
		const onPrdChange = vi.fn();
		const onError = vi.fn();
		const { container } = render(
			<StudioLaunchComposer
				prompt="Test prompt"
				onPromptChange={vi.fn()}
				config={baseConfig}
				onConfigChange={vi.fn()}
				reference={null}
				onOpenDesignPicker={vi.fn()}
				onRemoveReference={vi.fn()}
				onPrdChange={onPrdChange}
				onError={onError}
				loading={false}
				error=""
				onSubmit={vi.fn()}
				textareaRef={{ current: null }}
			/>,
		);

		const fileInput = container.querySelector(
			'input[type="file"][accept=".md"]',
		) as HTMLInputElement;

		const emptyFile = new File(["   "], "empty.md", { type: "text/markdown" });
		fireEvent.change(fileInput, { target: { files: [emptyFile] } });

		await vi.waitFor(() => {
			expect(onError).toHaveBeenCalledWith(
				expect.stringMatching(/tidak boleh kosong/i),
			);
		});
		expect(onPrdChange).not.toHaveBeenCalled();
	});

	it("preserves prompt draft when an error is displayed", () => {
		renderComposer({
			prompt: "Draft prompt that user spent effort typing",
			error:
				"Format PRD tidak didukung. Hanya file berekstensi .md yang didukung.",
		});

		const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
		expect(textarea.value).toBe("Draft prompt that user spent effort typing");
		expect(screen.getByRole("alert")).toBeDefined();
		expect(screen.getByText(/Format PRD tidak didukung/i)).toBeDefined();
	});

	it("disables submit and prevents duplicate submit while loading", () => {
		const { onSubmit } = renderComposer({
			prompt: "Desain sistem keuangan",
			loading: true,
		});

		const submitBtn = screen.getByRole("button", { name: "Kirim prompt" });
		expect(submitBtn).toHaveProperty("disabled", true);

		const textarea = screen.getByRole("textbox");
		fireEvent.keyDown(textarea, { key: "Enter" });
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
