import { describe, expect, it } from "vitest";
import { extractCleanHtml } from "./clean-html";

const DOC = "<html><head></head><body><p>Konten</p></body></html>";

describe("extractCleanHtml output contract", () => {
	it("mengisolasi dokumen dari prose generik di luar fence", () => {
		const raw = `Berikut hasilnya:\n\`\`\`html\n${DOC}\n\`\`\`\nSemoga membantu`;
		expect(extractCleanHtml(raw)).toBe(DOC);
	});

	it("menangani fence pembuka tanpa penutup secara eksplisit", () => {
		const raw = `\`\`\`html\n${DOC}`;
		expect(extractCleanHtml(raw)).toBe(DOC);
	});

	it("membuang prose generik di luar dokumen tanpa fence", () => {
		const raw = `Catatan pembuka generik\n${DOC}\nCatatan penutup generik`;
		expect(extractCleanHtml(raw)).toBe(DOC);
	});

	it("memilih kandidat fence yang memuat dokumen lengkap", () => {
		const raw = `Penjelasan\n\`\`\`\n<p>Fragmen</p>\n\`\`\`\n\`\`\`html\n${DOC}\n\`\`\``;
		expect(extractCleanHtml(raw)).toBe(DOC);
	});

	it("mempertahankan penanda fence di dalam blok code yang sah", () => {
		const inner =
			"<html><head></head><body><pre><code>```contoh```</code></pre></body></html>";
		const raw = `Prose pembuka\n${inner}\nProse penutup`;
		expect(extractCleanHtml(raw)).toBe(inner);
	});
});
