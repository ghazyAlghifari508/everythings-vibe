// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartWithDesignModal } from "./start-with-design-modal";

describe("StartWithDesignModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders modal when open is true", () => {
		render(
			<StartWithDesignModal
				open={true}
				onOpenChange={vi.fn()}
				onApply={vi.fn()}
			/>,
		);

		expect(screen.getByText("Start with your design")).toBeDefined();
		expect(
			screen.getByText(
				"Gunakan design system dan identitas visual yang sudah kamu punya sebagai referensi.",
			),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Gunakan desain ini" }),
		).toBeDefined();
	});

	it("validates and blocks submission when DESIGN.md is empty", () => {
		const onApply = vi.fn();
		render(
			<StartWithDesignModal
				open={true}
				onOpenChange={vi.fn()}
				onApply={onApply}
			/>,
		);

		const submitBtn = screen.getByRole("button", {
			name: "Gunakan desain ini",
		});
		fireEvent.click(submitBtn);

		expect(onApply).not.toHaveBeenCalled();
		expect(
			screen.getByText(
				"Masukkan teks DESIGN.md atau upload file .md terlebih dahulu.",
			),
		).toBeDefined();
	});

	it("accepts pasted DESIGN.md and applies successfully", () => {
		const onApply = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<StartWithDesignModal
				open={true}
				onOpenChange={onOpenChange}
				onApply={onApply}
			/>,
		);

		const textarea = screen.getByLabelText("Isi dokumen DESIGN.md");
		const sampleMd =
			"## Tokens - Colors\n| Canvas | #ffffff |\n| Primary | #0f0f0f |\n\n## Components\n- Card: rounded-xl";
		fireEvent.change(textarea, { target: { value: sampleMd } });

		const submitBtn = screen.getByRole("button", {
			name: "Gunakan desain ini",
		});
		fireEvent.click(submitBtn);

		expect(onApply).toHaveBeenCalledWith({
			designMd: sampleMd,
			logo: null,
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("rejects .fig files with a clear actionable message", () => {
		render(
			<StartWithDesignModal
				open={true}
				onOpenChange={vi.fn()}
				onApply={vi.fn()}
			/>,
		);

		const fileInput = screen.getByLabelText("Upload logo aplikasi");
		const figFile = new File(["dummy-fig-binary"], "app-logo.fig", {
			type: "application/octet-stream",
		});

		fireEvent.change(fileInput, { target: { files: [figFile] } });

		expect(
			screen.getByText(/Ekspor logo ke PNG, SVG, atau WebP/i),
		).toBeDefined();
	});

	it("cancels without applying", () => {
		const onApply = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<StartWithDesignModal
				open={true}
				onOpenChange={onOpenChange}
				onApply={onApply}
			/>,
		);

		const cancelBtn = screen.getByRole("button", { name: "Batalkan" });
		fireEvent.click(cancelBtn);

		expect(onApply).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("pre-populates with initialReference when provided", () => {
		const initialRef = {
			designMd: "## Tokens - Colors\n| Accent | #3b82f6 |",
			logo: {
				filename: "saved-logo.png",
				mimeType: "image/png",
				data: "base64",
				previewUrl: "data:image/png;base64,abc",
				byteLength: 1024,
			},
		};

		render(
			<StartWithDesignModal
				open={true}
				initialReference={initialRef}
				onOpenChange={vi.fn()}
				onApply={vi.fn()}
			/>,
		);

		const textarea = screen.getByLabelText(
			"Isi dokumen DESIGN.md",
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe(initialRef.designMd);
		expect(screen.getByText("saved-logo.png")).toBeDefined();
	});
});
