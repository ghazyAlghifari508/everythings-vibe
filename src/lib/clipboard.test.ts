// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns error for empty string", async () => {
		const result = await copyToClipboard("");
		expect(result.success).toBe(false);
		expect(result.error).toBe("Teks kosong tidak dapat disalin.");
	});

	it("copies successfully when navigator.clipboard.writeText resolves", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			clipboard: { writeText },
		});

		const result = await copyToClipboard("test content");
		expect(result.success).toBe(true);
		expect(writeText).toHaveBeenCalledWith("test content");
	});

	it("returns safe error when navigator.clipboard is unavailable", async () => {
		vi.stubGlobal("navigator", {});

		const result = await copyToClipboard("test content");
		expect(result.success).toBe(false);
		expect(result.error).toContain("Gagal menyalin otomatis");
	});

	it("returns safe error when writeText rejects", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
		vi.stubGlobal("navigator", {
			clipboard: { writeText },
		});

		const result = await copyToClipboard("test content");
		expect(result.success).toBe(false);
		expect(result.error).toContain("Gagal menyalin otomatis");
	});
});
