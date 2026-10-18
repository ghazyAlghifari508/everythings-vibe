// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartWithDesignModal } from "@/features/studio/components/design-system/start-with-design-modal";

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
				scrapeSources={[]}
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
				scrapeSources={[]}
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

	it("accepts pasted DESIGN.md and closes after persistence succeeds", async () => {
		const onApply = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<StartWithDesignModal
				open={true}
				scrapeSources={[]}
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
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("rejects .fig files with a clear actionable message", () => {
		render(
			<StartWithDesignModal
				open={true}
				scrapeSources={[]}
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
				scrapeSources={[]}
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
				scrapeSources={[]}
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

	it("applies a stored VibeScrape source by reference, never by pasting its text", async () => {
		const onApply = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();

		render(
			<StartWithDesignModal
				open={true}
				scrapeSources={[
					{
						id: "scrape-9",
						title: "Tokopedia",
						domain: "tokopedia.com",
						sourceUrl: "https://tokopedia.com",
					},
				]}
				onOpenChange={onOpenChange}
				onApply={onApply}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Gunakan" }));
		await waitFor(() => {
			expect(screen.getByText(/DESIGN.md dari/)).toBeDefined();
		});
		fireEvent.click(screen.getByRole("button", { name: "Gunakan desain ini" }));

		await waitFor(() => {
			expect(onApply).toHaveBeenCalledTimes(1);
		});
		expect(onApply.mock.calls[0][0]).toEqual({
			designMd: "",
			logo: null,
			designReference: { kind: "scrape", id: "scrape-9" },
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
